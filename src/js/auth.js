import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  confirmPasswordReset,
  signOut
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAv9GLbG8r5YHcHmLTStDIzhgmygNbtZto",
  authDomain: "man-daybook-fa42a.firebaseapp.com",
  projectId: "man-daybook-fa42a",
  storageBucket: "man-daybook-fa42a.firebasestorage.app",
  messagingSenderId: "856198110208",
  appId: "1:856198110208:web:b24424d4d6bc4d30070ce5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let mode = 'login';
let currentUser = null;
let callbacks = {};
let authResolved = false;
let signingUp = false;

export function initAuth(options = {}) {
  callbacks = options;

  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'resetPassword' && params.get('oobCode')) {
    showResetPasswordView(params.get('oobCode'));
    return;
  }

  bindAuthEvents();

  onAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      if (signingUp) return;
      currentUser = toUser(firebaseUser);
      showApp(currentUser);
      if (!authResolved) {
        callbacks.onSignedIn?.(currentUser, { restored: true });
      }
    } else {
      currentUser = null;
      showAuth();
      if (!authResolved) {
        callbacks.onSignedOut?.();
      }
    }
    authResolved = true;
  });
}

export function getCurrentUser() {
  return currentUser;
}

export async function getCurrentUserIdToken() {
  if (!auth.currentUser) throw new Error('Please log in first.');
  return auth.currentUser.getIdToken();
}

export function getUserDisplayName(user = currentUser) {
  if (!user) return '';
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.email;
}

export async function updateCurrentUserProfile({ firstName, lastName, email }) {
  if (!auth.currentUser) throw new Error('Please log in first.');

  const cleanFirstName = firstName.trim();
  const cleanLastName = lastName.trim();

  if (!cleanFirstName) throw new Error('Please enter your first name.');
  if (!cleanLastName) throw new Error('Please enter your last name.');

  await updateProfile(auth.currentUser, {
    displayName: `${cleanFirstName} ${cleanLastName}`
  });

  currentUser = toUser(auth.currentUser);
  currentUser.firstName = cleanFirstName;
  currentUser.lastName = cleanLastName;
  return currentUser;
}

export function getUserStorageKey(user = currentUser) {
  return user ? `mandaybook_v1_user_${user.id}` : 'mandaybook_v1';
}

export async function logout() {
  await signOut(auth);
  currentUser = null;
  showAuth();
  callbacks.onSignedOut?.();
}

function showResetPasswordView(oobCode) {
  document.getElementById('authView').hidden = true;
  document.getElementById('resetPasswordView').hidden = false;

  document.getElementById('resetBackBtn')?.addEventListener('click', () => {
    window.location.href = window.location.pathname;
  });

  document.getElementById('resetPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;

    const errorEl = document.getElementById('resetError');
    const successEl = document.getElementById('resetSuccess');
    errorEl.hidden = true;
    successEl.hidden = true;

    if (newPassword.length < 8) {
      errorEl.textContent = 'Password must be at least 8 characters.';
      errorEl.hidden = false;
      return;
    }
    if (newPassword !== confirmPassword) {
      errorEl.textContent = 'Passwords do not match.';
      errorEl.hidden = false;
      return;
    }

    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      successEl.textContent = 'Password updated! Redirecting to log in…';
      successEl.hidden = false;
      setTimeout(() => { window.location.href = window.location.pathname; }, 2000);
    } catch (error) {
      errorEl.textContent = friendlyError(error);
      errorEl.hidden = false;
    }
  });
}

function bindAuthEvents() {
  const form = document.getElementById('authForm');
  const toggle = document.getElementById('authModeToggle');

  form?.addEventListener('submit', handleSubmit);
  toggle?.addEventListener('click', () => {
    mode = mode === 'login' ? 'signup' : 'login';
    renderMode();
  });
  document.getElementById('authForgotBtn')?.addEventListener('click', handleForgotPassword);

  renderMode();
}

async function handleSubmit(event) {
  event.preventDefault();
  setAuthError('');

  const firstName = document.getElementById('authFirstName').value.trim();
  const lastName = document.getElementById('authLastName').value.trim();
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const password = document.getElementById('authPassword').value;
  const confirmPassword = document.getElementById('authConfirmPassword').value;

  try {
    if (mode === 'signup') {
      await signup({ firstName, lastName, email, password, confirmPassword });
      mode = 'login';
      renderMode('Account created. Please log in with your email and password.');
      document.getElementById('authEmail').value = email;
      document.getElementById('authPassword').value = '';
      document.getElementById('authConfirmPassword').value = '';
      return;
    }

    const user = await login(email, password);
    currentUser = user;
    showApp(user);
    callbacks.onSignedIn?.(user, { restored: false, mode });
  } catch (error) {
    setAuthError(friendlyError(error));
  }
}

async function handleForgotPassword() {
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    setAuthError('Please enter your email address first.');
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email, {
      url: 'https://mandaybook.vercel.app',
      handleCodeInApp: false
    });
    setAuthSuccess(`Password reset email sent to ${email}. Please check your inbox.`);
  } catch (error) {
    setAuthError(friendlyError(error));
  }
}

async function signup({ firstName, lastName, email, password, confirmPassword }) {
  if (!firstName) throw new Error('Please enter your first name.');
  if (!lastName) throw new Error('Please enter your last name.');
  if (!email || !email.includes('@')) throw new Error('Please enter a valid email.');
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters.');
  if (password !== confirmPassword) throw new Error('Passwords do not match.');

  signingUp = true;
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: `${firstName} ${lastName}` });
  await signOut(auth);
  signingUp = false;
}

async function login(email, password) {
  if (!email || !email.includes('@')) throw new Error('Please enter a valid email.');
  if (!password) throw new Error('Please enter your password.');

  const credential = await signInWithEmailAndPassword(auth, email, password);
  return toUser(credential.user);
}

function toUser(firebaseUser) {
  const parts = (firebaseUser.displayName || '').split(' ');
  return {
    id: firebaseUser.uid,
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
    email: firebaseUser.email,
    createdAt: firebaseUser.metadata.creationTime
  };
}

function friendlyError(error) {
  switch (error.code) {
    case 'auth/email-already-in-use': return 'This email is already registered.';
    case 'auth/invalid-email': return 'Please enter a valid email.';
    case 'auth/weak-password': return 'Password must be at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Email or password is incorrect.';
    case 'auth/too-many-requests': return 'Too many attempts. Please try again later.';
    default: return error.message || 'Something went wrong. Please try again.';
  }
}

function renderMode(successMessage = '') {
  const isSignup = mode === 'signup';
  setText('authTitle', isSignup ? 'Create your account' : 'Welcome');
  setText('authSubtitle', isSignup
    ? 'Fill in your details, then log in after your account is created.'
    : 'Log in to open your saved mandaybook workspace.');
  setText('authSubmit', isSignup ? 'Sign up' : 'Log in');
  setText('authModeHint', isSignup ? 'Already have an account?' : 'New here?');
  setText('authModeToggle', isSignup ? 'Log in' : 'Create account');
  document.getElementById('authNameFields').hidden = !isSignup;
  document.getElementById('authConfirmPasswordField').hidden = !isSignup;
  const passwordInput = document.getElementById('authPassword');
  passwordInput.autocomplete = isSignup ? 'new-password' : 'current-password';
  passwordInput.placeholder = isSignup ? 'At least 8 characters' : 'Your password';
  passwordInput.minLength = isSignup ? 8 : 0;
  document.getElementById('authConfirmPassword').minLength = isSignup ? 8 : 0;
  document.getElementById('authFirstName').required = isSignup;
  document.getElementById('authLastName').required = isSignup;
  document.getElementById('authConfirmPassword').required = isSignup;
  document.getElementById('authConfirmPassword').value = '';
  document.getElementById('authForgotRow').hidden = isSignup;
  setAuthError('');
  setAuthSuccess(successMessage);
}

function showAuth() {
  document.getElementById('authView').hidden = false;
  document.getElementById('dashboardView').hidden = true;
  document.getElementById('appView').hidden = true;
  document.getElementById('authPassword').value = '';
  document.getElementById('authConfirmPassword').value = '';
}

function showApp(user) {
  const auth = document.getElementById('authView');
  const dashboard = document.getElementById('dashboardView');

  setText('dashboardUserName', getUserDisplayName(user));
  setText('currentUserName', getUserDisplayName(user));

  dashboard.hidden = false;
  dashboard.style.opacity = '0';
  dashboard.style.transform = 'translateY(16px)';
  dashboard.style.transition = 'opacity 0.5s ease, transform 0.5s ease';

  auth.style.transition = 'opacity 0.3s ease';
  auth.style.opacity = '0';

  setTimeout(() => {
    auth.hidden = true;
    auth.style.opacity = '';
    document.getElementById('appView').hidden = true;
    requestAnimationFrame(() => {
      dashboard.style.opacity = '1';
      dashboard.style.transform = 'translateY(0)';
    });
  }, 300);
}

function setAuthError(message) {
  const error = document.getElementById('authError');
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
  if (message) setAuthSuccess('');
}

function setAuthSuccess(message) {
  const success = document.getElementById('authSuccess');
  if (!success) return;
  success.textContent = message;
  success.hidden = !message;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
