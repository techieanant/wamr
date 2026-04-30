#!/usr/bin/env python3
import re
import sys
from datetime import datetime, timedelta, time
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

URL = "https://appointments.servicebc.gov.bc.ca/appointment/available?locationSlug=maple-ridge-175&serviceSlug=driver-knowledge-test"

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
except Exception as e:
    print("[PLAYWRIGHT_IMPORT_ERROR]", file=sys.stderr)
    print("[SILENT]")
    sys.exit(0)

TZ = ZoneInfo("America/Vancouver") if ZoneInfo else None

def parse_time_slot(text):
    # Expect formats like '1:15PM - 2:00PM' or '1:15PM - 2:00PM'
    m = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))", text, re.IGNORECASE)
    if not m:
        return None
    return m.group(1).upper().replace(' ',''), m.group(2).upper().replace(' ','')


def parse_date_selected(body_text):
    # Look for 'Date Selected: <Month> <Day>, <Year>'
    m = re.search(r"Date Selected:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})", body_text)
    if m:
        try:
            dt = datetime.strptime(m.group(1), "%B %d, %Y")
            return dt.date()
        except Exception:
            pass
    # Fallback: look for a full month name, day, year elsewhere
    m2 = re.search(r"([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})", body_text)
    if m2:
        try:
            dt = datetime.strptime(f"{m2.group(1)} {m2.group(2)}, {m2.group(3)}", "%B %d, %Y")
            return dt.date()
        except Exception:
            pass
    return None


def to_iso_with_tz(dt_date, time_str):
    # time_str like '1:15PM'
    t = datetime.strptime(time_str, "%I:%M%p").time()
    dt = datetime.combine(dt_date, t)
    if TZ:
        dt = dt.replace(tzinfo=TZ)
    else:
        # fallback - assume -07:00 for PDT
        from datetime import timezone
        dt = dt.replace(tzinfo=timezone(timedelta(hours=-7)))
    return dt.isoformat()


def human_friendly(dt_date, start_str, end_str):
    # e.g. 'Apr 29 2026 1:15PM-2:00PM PT'
    start = datetime.strptime(start_str, "%I:%M%p").time()
    end = datetime.strptime(end_str, "%I:%M%p").time()
    # Format month short
    human_date = dt_date.strftime("%b %d %Y")
    # Format times without leading zero
    def fmt(t):
        return t.strftime("%#I:%M%p") if sys.platform.startswith('win') else t.strftime("%-I:%M%p")
    try:
        start_fmt = fmt(start)
        end_fmt = fmt(end)
    except Exception:
        start_fmt = start.strftime("%I:%M%p").lstrip('0')
        end_fmt = end.strftime("%I:%M%p").lstrip('0')
    return f"{human_date} {start_fmt}-{end_fmt} PT"


with sync_playwright() as p:
    try:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox","--disable-setuid-sandbox"]) 
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(30000)
        page.goto(URL)

        # Step 2: Select location - find combobox and type
        try:
            cb = page.query_selector('[role="combobox"]')
            if not cb:
                # try common selectors
                cb = page.query_selector('input')
            cb.click()
            cb.fill('Maple Ridge')
        except Exception:
            pass
        # wait for dropdown items and click Maple Ridge
        try:
            # either .v-list-item or role=option
            page.wait_for_timeout(1000)
            option = page.query_selector(".v-list-item:has-text('Maple Ridge')")
            if not option:
                option = page.query_selector("[role=option]:has-text('Maple Ridge')")
            if option:
                option.click()
        except Exception:
            pass

        # Click Book Appointment button
        try:
            btn = page.query_selector("button:has-text('Book Appointment')")
            if not btn:
                btn = page.query_selector("button:has-text('Book appointment')")
            if not btn:
                # fallback to any button containing 'Book'
                btn = page.query_selector("button:has-text('Book')")
            if btn:
                btn.click()
        except Exception:
            pass

        # Step 3: Select service
        try:
            # click visible .v-select or .v-autocomplete
            sel = page.query_selector('.v-select') or page.query_selector('.v-autocomplete')
            if sel:
                sel.click()
            # type into the active input
            page.keyboard.type('knowledge test')
            page.wait_for_timeout(800)
            svc = page.query_selector(".v-list-item:has-text('BC Driver Knowledge Test')")
            if not svc:
                svc = page.query_selector("[role=option]:has-text('BC Driver Knowledge Test')")
            if svc:
                svc.click()
            # click Next
            nxt = page.query_selector("button:has-text('Next')") or page.query_selector("button:has-text('Continue')")
            if nxt:
                nxt.click()
        except Exception:
            pass

        # Step 4: Wait for calendar and read date
        page.wait_for_timeout(2000)
        body = page.content()
        date_selected = parse_date_selected(body)

        # If not found, look for selected day in calendar (button with aria-pressed or class)
        if not date_selected:
            try:
                # find element that contains 'Date Selected' visible text
                el = page.query_selector("text=Date Selected")
                if el:
                    txt = el.text_content()
                    date_selected = parse_date_selected(txt)
            except Exception:
                pass

        # find time slots text
        slots_text = None
        try:
            # look for 'Available Time Slots' then capture following siblings
            el = page.query_selector("text=Available Time Slots")
            if el:
                # get container
                parent = el.evaluate_handle('e => e.parentElement')
                html = parent.evaluate('e => e.innerText')
                m = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM))", html, re.IGNORECASE)
                if m:
                    slots_text = m.group(1)
            if not slots_text:
                # fallback: search whole page
                m2 = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM))", body, re.IGNORECASE)
                if m2:
                    slots_text = m2.group(1)
        except Exception:
            pass

        if not slots_text or not date_selected:
            print("[SILENT]")
            browser.close()
            sys.exit(0)

        parsed = parse_time_slot(slots_text)
        if not parsed:
            print("[SILENT]")
            browser.close()
            sys.exit(0)
        start_str, end_str = parsed

        # assemble datetime and check within 7 days
        iso = to_iso_with_tz(date_selected, start_str)
        # compute delta from now in America/Vancouver
        now = datetime.now(TZ) if TZ else datetime.utcnow()
        dt_start = datetime.fromisoformat(iso)
        delta = dt_start - now
        if delta.total_seconds() < 0:
            # already past -> silent
            print("[SILENT]")
            browser.close()
            sys.exit(0)
        if delta > timedelta(days=7):
            print("[SILENT]")
            browser.close()
            sys.exit(0)

        # duration
        tstart = datetime.strptime(start_str, "%I:%M%p")
        tend = datetime.strptime(end_str, "%I:%M%p")
        dur = int((datetime.combine(datetime.min, tend.time()) - datetime.combine(datetime.min, tstart.time())).total_seconds() / 60)
        if dur <= 0:
            # cross midnight? take positive by adding 24h
            dur += 24*60
        # human friendly
        human = human_friendly(date_selected, start_str, end_str)

        # final output
        line = f"{iso} | {human} | {dur}m | Maple Ridge | BC Driver Knowledge Test (All Classes) | source=UI | conf=high"
        print(line)
        browser.close()
    except PWTimeout:
        print("[SILENT]")
        sys.exit(0)
    except Exception as e:
        # On any error, be silent
        print("[SILENT]")
        try:
            browser.close()
        except Exception:
            pass
        sys.exit(0)
