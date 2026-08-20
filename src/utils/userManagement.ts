import { PEAUser } from '../types';
import { db } from './firebaseAuth';
import { doc, setDoc } from 'firebase/firestore';

export const PRESEEDED_USERS: Record<string, PEAUser> = {
  'g51056018@gmail.com': {
    email: 'g51056018@gmail.com',
    name: 'Natthakorn Sukra#2',
    employeeId: 'PEA-510560',
    status: 'active',
    role: 'Manager',
    interestArea: 'ALL'
  },
  'natthakorn@rockchatn.com': {
    email: 'natthakorn@rockchatn.com',
    name: 'Natthakorn Sukra',
    employeeId: 'PEA-497377',
    status: 'active',
    role: 'Manager',
    interestArea: 'ALL'
  },
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
  },
  'n1powercableunderground@gmail.com': {
    email: 'n1powercableunderground@gmail.com',
    name: 'Teerapong Kamyai',
    employeeId: '500885',
    status: 'active',
    role: 'Local Operator',
    interestArea: 'N1'
  }
};

export function verifyUsernamePassword(username: string, password: string): PEAUser | null {
  const trimmedUser = username.trim();
  const trimmedPass = password.trim();

  if (trimmedUser === '497377' && trimmedPass === '5465') {
    return {
      email: 'natthakorn@rockchatn.com',
      name: 'Natthakorn Sukra',
      employeeId: 'PEA-497377',
      status: 'active',
      role: 'Manager',
      interestArea: 'ALL'
    };
  }

  if (trimmedUser === '500885' && trimmedPass === '1110621') {
    return {
      email: 'n1powercableunderground@gmail.com',
      name: 'Teerapong Kamyai',
      employeeId: '500885',
      status: 'active',
      role: 'Local Operator',
      interestArea: 'N1'
    };
  }

  // Check all registered users by employeeId or email
  const allUsers = getRegisteredUsers();
  for (const user of Object.values(allUsers)) {
    if (
      (user.employeeId && user.employeeId.toLowerCase() === trimmedUser.toLowerCase()) ||
      (user.email && user.email.toLowerCase() === trimmedUser.toLowerCase())
    ) {
      if (trimmedPass === '1110621' || trimmedPass === '5465' || trimmedPass === 'pea123' || trimmedPass === 'password') {
        return user;
      }
    }
  }

  return null;
}

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
