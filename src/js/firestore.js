/**
 * firestore.js
 * Syncs localStorage data to/from Firebase Firestore.
 * Strategy: pull on login → write to localStorage → app runs normally.
 *           push on every save → fire-and-forget, non-blocking.
 */

import { getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs
} from 'firebase/firestore';

let db = null;

export function initFirestore() {
  if (!db) db = getFirestore(getApp());
}

/**
 * Pull all user data from Firestore into localStorage.
 * Also auto-migrates existing localStorage data up to Firestore if Firestore is empty.
 */
export async function pullUserData(uid, companiesStorageKey) {
  if (!db) return;
  try {
    const companiesRef = doc(db, 'users', uid, 'data', 'companies');
    const companiesSnap = await getDoc(companiesRef);

    if (companiesSnap.exists()) {
      // Firestore has data — write to localStorage
      const { list } = companiesSnap.data();
      localStorage.setItem(companiesStorageKey, JSON.stringify(list));

      // Pull each project
      const projectsSnap = await getDocs(collection(db, 'users', uid, 'projects'));
      projectsSnap.forEach(docSnap => {
        const { storageKey, data } = docSnap.data();
        if (storageKey && data) {
          localStorage.setItem(storageKey, JSON.stringify(data));
        }
      });
    } else {
      // Firestore empty — migrate localStorage up
      const localRaw = localStorage.getItem(companiesStorageKey);
      if (localRaw) {
        const companies = JSON.parse(localRaw);
        await pushCompanies(uid, companiesStorageKey, companies);

        // Find and migrate all project keys for this user
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes(`user_${uid}_company_`)) {
            try {
              const data = JSON.parse(localStorage.getItem(key));
              if (data) await pushProject(uid, key, data);
            } catch (_) {}
          }
        }
      }
    }
  } catch (e) {
    console.warn('Firestore pull failed:', e);
  }
}

/**
 * Push companies list to Firestore. Fire-and-forget safe.
 */
export async function pushCompanies(uid, storageKey, companies) {
  if (!db) return;
  try {
    await setDoc(doc(db, 'users', uid, 'data', 'companies'), {
      list: companies,
      storageKey,
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Firestore pushCompanies failed:', e);
  }
}

/**
 * Push a single project state to Firestore. Fire-and-forget safe.
 */
export async function pushProject(uid, storageKey, stateData) {
  if (!db) return;
  try {
    const docId = storageKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    await setDoc(doc(db, 'users', uid, 'projects', docId), {
      storageKey,
      data: stateData,
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Firestore pushProject failed:', e);
  }
}
