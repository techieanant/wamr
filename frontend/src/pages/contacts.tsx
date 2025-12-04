import { useState, useRef, useEffect } from 'react';
import { useContacts } from '../hooks/use-contacts';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Edit, Trash2, UserPlus, Users, X, Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

export default function ContactsPage() {
  const { contacts, isLoading, updateContact, deleteContact, createContact, isDeleting } =
    useContacts();
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [editingPhone, setEditingPhone] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'created_desc' | 'created_asc' | 'name_asc' | 'name_desc'>(
    'created_desc'
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const startEdit = (id: number, name?: string | null, phone?: string | null) => {
    setEditingId(id);
    setEditingName(name || '');
    const contact = contacts.find((c) => c.id === id);
    setEditingPhone(phone || contact?.phoneNumber || '');
  };

  const saveEdit = (id: number) => {
    const payload: { contactName?: string; phoneNumber?: string } = {};
    if (editingName !== '') payload.contactName = editingName;
    if (editingPhone !== '') payload.phoneNumber = editingPhone;
    updateContact({ id, data: payload });
    setEditingId(null);
  };

  const handleDelete = (id: number) => {
    setContactToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (contactToDelete) {
      deleteContact(contactToDelete);
      setDeleteDialogOpen(false);
      setContactToDelete(null);
    }
  };

  const handleCreate = () => {
    // Create using raw phone; backend will hash/normalize
    createContact({ phoneNumber: newPhone, contactName: newName });
    setNewPhone('');
    setNewName('');
  };

  // Auto-focus the input for the current editing row
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  // Search filter for contacts table
  const filteredContacts = contacts.filter((c) => {
    if (query) {
      const q = query.toLowerCase();
      const phoneCandidate = (
        c.phoneNumber ||
        c.maskedPhone ||
        c.phoneNumberHash ||
        ''
      ).toLowerCase();
      const nameCandidate = (c.contactName || '').toLowerCase();
      if (!phoneCandidate.includes(q) && !nameCandidate.includes(q) && !String(c.id).includes(q))
        return false;
    }
    return true;
  });

  // Sorting
  const sortedContacts = [...filteredContacts].sort((a, b) => {
    if (sortBy === 'created_desc')
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortBy === 'created_asc')
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    // name sorts
    const nameA = (a.contactName || '').toLowerCase();
    const nameB = (b.contactName || '').toLowerCase();
    if (sortBy === 'name_asc') return nameA.localeCompare(nameB);
    if (sortBy === 'name_desc') return nameB.localeCompare(nameA);
    return 0;
  });

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
            <Users className="h-6 w-6 md:h-8 md:w-8" />
            Contacts
          </h1>
          <p className="mt-2 text-muted-foreground">Manage contact names and phone numbers</p>
        </div>
      </div>

      {/* Add New Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5" />
            Add New Contact
          </CardTitle>
          <CardDescription>Create a new contact with phone number and name</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Input
              placeholder="Phone number (e.g. +1 555-123-4567)"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Input
              placeholder="Contact name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={!newPhone}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search and Sort */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <div className="relative">
                <Input
                  placeholder="Search by name, phone, or ID..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pr-8"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <Select
              value={sortBy}
              onValueChange={(value) =>
                setSortBy(value as 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc')
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_desc">Newest first</SelectItem>
                <SelectItem value="created_asc">Oldest first</SelectItem>
                <SelectItem value="name_asc">Name A-Z</SelectItem>
                <SelectItem value="name_desc">Name Z-A</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Contacts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Contacts</CardTitle>
            <p className="text-sm text-muted-foreground">
              Showing {sortedContacts.length} of {contacts.length} total contacts
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <p className="text-muted-foreground">Loading contacts...</p>
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <div className="text-center">
                <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">No contacts configured</p>
                <p className="mt-1 text-sm text-muted-foreground">Add your first contact above</p>
              </div>
            </div>
          ) : sortedContacts.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <div className="text-center">
                <p className="text-muted-foreground">No contacts match your search</p>
                <Button variant="link" onClick={() => setQuery('')} className="mt-2">
                  Clear search
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">ID</TableHead>
                    <TableHead className="min-w-[180px]">Phone</TableHead>
                    <TableHead className="min-w-[150px]">Name</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedContacts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm">{c.id}</TableCell>
                      <TableCell
                        className="font-mono text-sm"
                        onClick={() => !editingId && startEdit(c.id, c.contactName, c.phoneNumber)}
                      >
                        {editingId === c.id ? (
                          <Input
                            ref={inputRef}
                            value={editingPhone}
                            onChange={(e) => setEditingPhone(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(c.id);
                              if (e.key === 'Escape') {
                                setEditingId(null);
                                setEditingName('');
                                setEditingPhone('');
                              }
                            }}
                            className="max-w-[200px]"
                          />
                        ) : (
                          <span className="cursor-pointer hover:text-primary">
                            {c.phoneNumber || c.maskedPhone || truncateHash(c.phoneNumberHash)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell
                        onClick={() => !editingId && startEdit(c.id, c.contactName, c.phoneNumber)}
                      >
                        {editingId === c.id ? (
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(c.id);
                              if (e.key === 'Escape') {
                                setEditingId(null);
                                setEditingName('');
                                setEditingPhone('');
                              }
                            }}
                            className="max-w-[200px]"
                          />
                        ) : (
                          <span className="cursor-pointer hover:text-primary">
                            {c.contactName || '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingId === c.id ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => saveEdit(c.id)}>
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingId(null);
                                setEditingName('');
                                setEditingPhone('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startEdit(c.id, c.contactName, c.phoneNumber)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(c.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this contact from the database. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setContactToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-500 hover:bg-red-600"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function truncateHash(hash?: string | null) {
  if (!hash) return '-';
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}
