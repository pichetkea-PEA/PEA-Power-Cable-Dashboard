import { PEAUser } from '../types';
import { db } from './firebaseAuth';
import { doc, setDoc } from 'firebase/firestore';

export const PRESEEDED_USERS: Record<string, PEAUser> = {
  'moskmitl50@gmail.com': {
    email: 'moskmitl50@gmail.com',
    name: 'Mos KMITL (Manager)',
    employeeId: 'PEA-50001',
    status: 'active',
    role: 'Manager',
    interestArea: 'ALL'
  },
  'pichet.kea@gmail.com': {
    email: 'pichet.kea@gmail.com',
    name: 'Pichet Kea (Admin)',
    employeeId: 'PEA-10001',
    status: 'active',
    role: 'Admin',
    interestArea: 'ALL'
  },
  'admin@pea.co.th': {
    email: 'admin@pea.co.th',
    name: 'PEA Executive Admin',
    employeeId: 'PEA-10002',
    status: 'active',
    role: 'Admin',
    interestArea: 'ALL'
  }
};

const REGISTERED_USERS_KEY = 'pea_registered_users_list_v1';

export function getRegisteredUsers(): Record<string, PEAUser> {
  const localSaved = localStorage.getItem(REGISTERED_USERS_KEY);
  let users: Record<string, PEAUser> = { ...PRESEEDED_USERS };
  if (localSaved) {
    try {
      const parsed = JSON.parse(localSaved);
      users = { ...users, ...parsed };
    } catch (e) {
      console.error('Failed to parse registered users from local cache', e);
    }
  }
  return users;
}

export function saveUserAccount(user: PEAUser): void {
  const current = getRegisteredUsers();
  const normalizedEmail = user.email.toLowerCase().trim();
  const updatedUser: PEAUser = {
    ...user,
    email: normalizedEmail,
    employeeId: user.employeeId || `PEA-${Math.floor(10000 + Math.random() * 90000)}`,
    requestId: user.requestId || `REQ-PEA-${Math.floor(10000 + Math.random() * 90000)}`,
    status: user.status || 'pending'
  };
  current[normalizedEmail] = updatedUser;
  localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(current));

  // Sync to Firestore asynchronously
  try {
    const safeDocId = normalizedEmail.replace(/[^a-z0-9]/gi, '_');
    const docRef = doc(db, 'registered_users', safeDocId);
    setDoc(docRef, updatedUser, { merge: true }).catch(err => {
      console.warn('Firestore user save warning:', err);
    });
  } catch (err) {
    console.warn('Firestore user save catch:', err);
  }
}

export function findUserByEmail(email: string): PEAUser | null {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  const allUsers = getRegisteredUsers();
  return allUsers[normalized] || null;
}

export function approveUserAccount(email: string): PEAUser | null {
  const user = findUserByEmail(email);
  if (!user) return null;
  const approvedUser: PEAUser = { ...user, status: 'active' };
  saveUserAccount(approvedUser);
  return approvedUser;
}

export function rejectUserAccount(email: string): PEAUser | null {
  const user = findUserByEmail(email);
  if (!user) return null;
  const rejectedUser: PEAUser = { ...user, status: 'rejected' };
  saveUserAccount(rejectedUser);
  return rejectedUser;
}

export function getPendingUsers(): PEAUser[] {
  const all = getRegisteredUsers();
  return Object.values(all).filter(u => u.status === 'pending');
}

export function isAdminAccount(email: string): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const found = findUserByEmail(normalized);
  if (found && found.role === 'Admin') return true;
  // Fallback check for known admin accounts
  if (normalized === 'pichet.kea@gmail.com' || normalized === 'admin@pea.co.th') return true;
  return false;
}
