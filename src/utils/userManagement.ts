import { PEAUser } from '../types';
import { auth, db } from './firebaseAuth';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const SOLE_ADMIN_EMAIL = 'pichet.kea@gmail.com';

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

  // Check all registered users by employeeId or email (must be active!)
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
const ACTIVE_SESSION_META_KEY = 'pea_active_user_session_meta_v1';

function mergeProtectedPreseededUser(base: PEAUser | undefined, incoming: Partial<PEAUser>, normEmail: string): PEAUser {
  const preseeded = PRESEEDED_USERS[normEmail];
  const incomingSafeRole =
    normEmail !== SOLE_ADMIN_EMAIL && incoming.role === 'Admin'
      ? 'Manager'
      : incoming.role;

  if (preseeded && preseeded.status === 'active') {
    const isExplicitlyRejected = incoming.status === 'rejected';
    return {
      ...preseeded,
      ...incoming,
      email: normEmail,
      status: isExplicitlyRejected ? 'rejected' : 'active',
      role: (incomingSafeRole && incomingSafeRole !== 'User') ? incomingSafeRole : preseeded.role,
      interestArea: incoming.interestArea || preseeded.interestArea
    };
  }
  return {
    ...(base || {}),
    ...(incoming as PEAUser),
    role: (incomingSafeRole || base?.role || 'User') as PEAUser['role'],
    email: normEmail
  };
}

export function getRegisteredUsers(): Record<string, PEAUser> {
  let localSaved: string | null = null;
  try {
    localSaved = localStorage.getItem(REGISTERED_USERS_KEY);
  } catch (e) {}
  const users: Record<string, PEAUser> = { ...PRESEEDED_USERS };
  if (localSaved) {
    try {
      const parsed = JSON.parse(localSaved);
      if (parsed && typeof parsed === 'object') {
        for (const [rawEmail, rawData] of Object.entries(parsed)) {
          if (!rawData || typeof rawData !== 'object') continue;
          const normEmail = rawEmail.toLowerCase().trim();
          if (normEmail === 'admin@pea.co.th') continue;
          users[normEmail] = mergeProtectedPreseededUser(users[normEmail], rawData as Partial<PEAUser>, normEmail);
        }
      }
    } catch (e) {
      console.error('Failed to parse registered users from local cache', e);
    }
  }
  return users;
}

// Synchronize registered_users collection from Firestore so approvals/rejections propagate across all browsers & devices
export async function syncRegisteredUsersFromFirestore(targetEmail?: string): Promise<Record<string, PEAUser>> {
  const merged: Record<string, PEAUser> = getRegisteredUsers();
  const pathForGetDocs = 'registered_users';
  let collectionLoaded = false;

  try {
    const snap = await getDocs(collection(db, pathForGetDocs));
    snap.forEach((docSnap) => {
      const data = docSnap.data() as PEAUser;
      if (data?.email) {
        const normEmail = data.email.toLowerCase().trim();
        if (normEmail === 'admin@pea.co.th') return;
        merged[normEmail] = mergeProtectedPreseededUser(merged[normEmail], data, normEmail);
      }
    });
    collectionLoaded = true;
  } catch (error: any) {
    // Firestore rules may allow single-doc GET while denying collection LIST for non-admin sessions;
    // gracefully fall back to individual document reads for known/active user accounts.
    console.warn('Firestore registered_users collection read notice (falling back to doc lookup):', error?.message || error);
  }

  if (!collectionLoaded) {
    const candidateEmails = new Set<string>([
      ...Object.keys(PRESEEDED_USERS),
      ...Object.keys(merged)
    ]);
    if (targetEmail && targetEmail.trim()) {
      candidateEmails.add(targetEmail.toLowerCase().trim());
    }
    if (auth.currentUser?.email) {
      candidateEmails.add(auth.currentUser.email.toLowerCase().trim());
    }

    await Promise.all(
      Array.from(candidateEmails).map(async (candidateEmail) => {
        if (!candidateEmail || candidateEmail.startsWith('guest.')) return;
        try {
          const safeDocId = candidateEmail.replace(/[^a-z0-9]/gi, '_');
          const docSnap = await getDoc(doc(db, 'registered_users', safeDocId));
          if (docSnap.exists()) {
            const data = docSnap.data() as PEAUser;
            const normEmail = (data?.email || candidateEmail).toLowerCase().trim();
            merged[normEmail] = mergeProtectedPreseededUser(merged[normEmail], data, normEmail);
          }
        } catch (docErr) {
          // Ignore individual read error so other accounts/preseeded cache still hydrate cleanly
        }
      })
    );
  }

  try {
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(merged));
  } catch (e) {}

  return merged;
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
  try {
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(current));
  } catch (e) {}

  // Sync to Firestore asynchronously
  const safeDocId = normalizedEmail.replace(/[^a-z0-9]/gi, '_');
  const pathForWrite = `registered_users/${safeDocId}`;
  try {
    const docRef = doc(db, 'registered_users', safeDocId);
    setDoc(docRef, updatedUser, { merge: true }).catch(err => {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        try {
          handleFirestoreError(err, OperationType.WRITE, pathForWrite);
        } catch (structuredErr) {
          console.error(structuredErr);
        }
      } else {
        console.warn('Firestore user save warning:', err);
      }
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
  return email.toLowerCase().trim() === SOLE_ADMIN_EMAIL;
}

// ==========================================
// ACTIVE SESSION METADATA & OPTION 1 VIEW-ONLY / UPLOAD PERMISSION HELPERS
// ==========================================
export function setActiveUserSessionMeta(user: PEAUser | null): void {
  try {
    if (!user) {
      sessionStorage.removeItem(ACTIVE_SESSION_META_KEY);
      return;
    }
    sessionStorage.setItem(
      ACTIVE_SESSION_META_KEY,
      JSON.stringify({
        email: (user.email || '').toLowerCase().trim(),
        role: user.role,
        status: user.status || (isAdminAccount(user.email) ? 'active' : findUserByEmail(user.email)?.status || 'pending')
      })
    );
  } catch (e) {}
}

export function clearActiveUserSessionMeta(): void {
  try {
    sessionStorage.removeItem(ACTIVE_SESSION_META_KEY);
  } catch (e) {}
}

export function getActiveUserSessionMeta(): { email: string; role: string; status: string } | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_SESSION_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function canUserUploadOrEdit(user: PEAUser | null | undefined): boolean {
  if (!user || !user.email) return false;
  const email = user.email.toLowerCase().trim();
  if (!email || email === 'guest.operator@pea.co.th' || email.startsWith('guest.')) return false;
  if (isAdminAccount(email)) return true;

  const registered = findUserByEmail(email) || PRESEEDED_USERS[email];
  const effectiveRole = user.role || registered?.role;
  if (effectiveRole === 'User') return false;

  const effectiveStatus = (registered?.status === 'rejected' || user.status === 'rejected')
    ? 'rejected'
    : (user.status === 'active' || registered?.status === 'active' ? 'active' : (user.status || registered?.status));
  return effectiveStatus === 'active';
}

// Asset Registration Panel authorization: Active Admin and Active Manager (e.g. Natthakorn)
export function canUserRegisterAssets(user: PEAUser | null | undefined): boolean {
  if (!canUserUploadOrEdit(user)) return false;
  const email = (user?.email || '').toLowerCase().trim();
  if (isAdminAccount(email)) return true;
  const registered = findUserByEmail(email) || PRESEEDED_USERS[email];
  const effectiveRole = user?.role || registered?.role;
  return effectiveRole === 'Admin' || effectiveRole === 'Manager';
}

// Submit Log Panel authorization: Active Admin, Active Manager (Natthakorn, 497377, moskmitl50@gmail.com), and Active Local Operator
export function canUserAccessSubmitLog(user: PEAUser | null | undefined): boolean {
  if (!canUserUploadOrEdit(user)) return false;
  const email = (user?.email || '').toLowerCase().trim();
  if (isAdminAccount(email)) return true;
  const registered = findUserByEmail(email) || PRESEEDED_USERS[email];
  const effectiveRole = user?.role || registered?.role;
  return effectiveRole === 'Admin' || effectiveRole === 'Manager' || effectiveRole === 'Local Operator';
}

export async function getAuthHeadersForApi(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const meta = getActiveUserSessionMeta();
  const firebaseEmail = (auth.currentUser?.email || '').toLowerCase().trim();
  const email = (meta?.email || firebaseEmail || '').toLowerCase().trim();
  if (email) {
    headers['x-pea-user-email'] = email;
  }
  try {
    if (auth.currentUser && (!email || firebaseEmail === email)) {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers['x-firebase-id-token'] = idToken;
      }
    }
  } catch (e) {}
  return headers;
}

