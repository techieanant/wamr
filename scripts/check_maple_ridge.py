#!/usr/bin/env python3
import re
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError

URL = "https://appointments.servicebc.gov.bc.ca/appointment/available?locationSlug=maple-ridge-175&serviceSlug=driver-knowledge-test"
TIMEZONE = ZoneInfo("America/Vancouver")

def main():
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--no-sandbox","--disable-setuid-sandbox"]) 
            context = browser.new_context()
            page = context.new_page()
            page.set_default_timeout(20000)
            page.goto(URL, wait_until="networkidle")

            # Step: Select office combobox
            try:
                # Type into combobox
                combobox = page.query_selector('[role="combobox"]')
                if combobox:
                    combobox.click()
                    combobox.fill("Maple Ridge")
                    page.wait_for_timeout(500)
                    # click list item
                    item = page.locator('.v-list-item', has_text="Maple Ridge").first
                    item.click()
                else:
                    # try alternative: input element
                    inp = page.query_selector('input')
                    if inp:
                        inp.click()
                        inp.fill("Maple Ridge")
                        page.locator('.v-list-item', has_text="Maple Ridge").first.click()
            except Exception:
                pass

            # Click Book Appointment button (tolerant)
            try:
                btn = page.get_by_role('button', name=re.compile(r'book', re.I))
                btn.click()
            except Exception:
                # fallback: button text contains Book
                try:
                    page.locator('button', has_text=re.compile(r'book', re.I)).first.click()
                except Exception:
                    pass

            # Step: select service
            try:
                # click visible v-select / v-autocomplete
                sel = page.locator('.v-select, .v-autocomplete').filter(has_text='').first
                sel.click()
            except Exception:
                # try generic selector
                try:
                    page.click('.v-select')
                except Exception:
                    pass

            try:
                # type "knowledge test"
                page.keyboard.type('knowledge test', delay=50)
                page.wait_for_timeout(500)
                page.locator('.v-list-item', has_text='BC Driver Knowledge Test').first.click()
            except Exception:
                # try role=option
                try:
                    page.locator('[role="option"]', has_text='BC Driver Knowledge Test').first.click()
                except Exception:
                    pass

            # Click Next / Continue
            try:
                nxt = page.get_by_role('button', name=re.compile(r'next|continue', re.I))
                nxt.click()
            except Exception:
                try:
                    page.locator('button', has_text=re.compile(r'next|continue', re.I)).first.click()
                except Exception:
                    pass

            # Wait for calendar/date selected or available times
            try:
                # Wait up to 15s for date selected text
                page.wait_for_selector("text=Date Selected:", timeout=15000)
                content = page.content()
            except PWTimeoutError:
                content = page.content()

            # Search for "Date Selected: Month Day, Year"
            m = re.search(r'Date Selected:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})', content)
            date_text = None
            if m:
                date_text = m.group(1).strip()
            else:
                # try alternative: look for aria-selected date button or active day
                # search for elements like aria-label="..."
                m2 = re.search(r'aria-label="([A-Za-z]+\s+\d{1,2},\s+\d{4})"\s+class="[^"]*v-date-picker.*selected', content)
                if m2:
                    date_text = m2.group(1).strip()

            # Find first available time slot text below
            # Look for times like 1:15PM - 2:00PM or 1:15 PM - 2:00 PM
            ts_match = re.search(r'(\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM))', content, re.I)
            time_slot = ts_match.group(1).strip() if ts_match else None

            if not date_text or not time_slot:
                # if calendar exists but no available slots, assume no dates
                print("[SILENT]")
                return

            # Parse date_text and time_slot
            try:
                # date_text example: April 29, 2026
                dt_date = datetime.strptime(date_text, '%B %d, %Y')
            except Exception:
                try:
                    dt_date = datetime.strptime(date_text, '%b %d, %Y')
                except Exception:
                    print("[SILENT]")
                    return

            # Parse times
            ts = re.match(r"(\d{1,2}:\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM)", time_slot, re.I)
            if not ts:
                # try with spaces
                ts = re.match(r"(\d{1,2}:\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM)", time_slot.replace('\u00A0',' '), re.I)
            if not ts:
                print("[SILENT]")
                return

            start_time_str, start_ampm, end_time_str, end_ampm = ts.groups()
            start_dt = datetime.strptime(f"{dt_date.strftime('%Y-%m-%d')} {start_time_str}{start_ampm.upper()}", '%Y-%m-%d %I:%M%p')
            end_dt = datetime.strptime(f"{dt_date.strftime('%Y-%m-%d')} {end_time_str}{end_ampm.upper()}", '%Y-%m-%d %I:%M%p')

            # localize to America/Vancouver
            start_dt = start_dt.replace(tzinfo=TIMEZONE)
            end_dt = end_dt.replace(tzinfo=TIMEZONE)

            # Check 7-day window
            now = datetime.now(TIMEZONE)
            delta = start_dt - now
            if delta.total_seconds() < 0:
                # slot in past? treat as silent
                print("[SILENT]")
                return
            if delta > timedelta(days=7):
                print("[SILENT]")
                return

            # Format ISO with offset like -07:00
            iso = start_dt.isoformat()
            # Human friendly: Apr 29 2026 1:15PM-2:00PM PT
            human_date = start_dt.strftime('%b %d %Y')
            # format times without leading zeros
            def fmt_time(dt):
                return dt.strftime('%-I:%M%p') if sys.platform != 'win32' else dt.strftime('%#I:%M%p')
            try:
                start_fmt = fmt_time(start_dt)
                end_fmt = fmt_time(end_dt)
            except Exception:
                # fallback
                start_fmt = start_dt.strftime('%I:%M%p').lstrip('0')
                end_fmt = end_dt.strftime('%I:%M%p').lstrip('0')
            human = f"{human_date} {start_fmt}-{end_fmt} PT"

            duration_min = int((end_dt - start_dt).total_seconds() / 60)
            duration = f"{duration_min}m"

            output = f"{iso} | {human} | {duration} | Maple Ridge | BC Driver Knowledge Test (All Classes) | source=UI | conf=high"
            print(output)
            return
    except Exception:
        print("[SILENT]")

if __name__ == '__main__':
    main()
