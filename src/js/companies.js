export function getCompaniesStorageKey(user) {
  return `mandaybook_companies_${user.id}`;
}

export function getCompanyStateStorageKey(user, company) {
  return `mandaybook_v1_user_${user.id}_company_${company.id}`;
}

export function getLegacyUserStateStorageKey(user) {
  return `mandaybook_v1_user_${user.id}`;
}

const CARD_COLORS = ['#c0192b', '#01579b', '#ffa726'];

export const DEFAULT_WALLPAPERS = [
  'linear-gradient(145deg,#1a1a2e 0%,#16213e 40%,#0f3460 70%,#533483 100%)',
  'linear-gradient(145deg,#0d1b2a 0%,#1b4332 40%,#2d6a4f 70%,#52b788 100%)',
  'linear-gradient(145deg,#7b2d00 0%,#b5451b 40%,#c77c5a 70%,#f2cc8f 100%)',
  'linear-gradient(145deg,#03045e 0%,#0077b6 40%,#00b4d8 70%,#90e0ef 100%)',
  'linear-gradient(145deg,#240046 0%,#7b2fbe 40%,#c77dff 70%,#e0aaff 100%)',
  'linear-gradient(145deg,#1d3461 0%,#1f5f8b 40%,#1891ac 70%,#38a3a5 100%)',
];

export const DEFAULT_CARD_WALLPAPERS = [
  '/src/assets/wallpapers/photo-1429704658776-3d38c9990511.avif',
  '/src/assets/wallpapers/photo-1451337516015-6b6e9a44a8a3.avif',
  '/src/assets/wallpapers/photo-1505142468610-359e7d316be0.avif',
  '/src/assets/wallpapers/photo-1511884642898-4c92249e20b6.avif',
  '/src/assets/wallpapers/photo-1761349319502-e40403b510a8.avif',
  '/src/assets/wallpapers/photo-1761349240807-d0561f22913c.avif',
  '/src/assets/wallpapers/photo-1579783902614-a3fb3927b6a5.avif',
  '/src/assets/wallpapers/photo-1578301978018-3005759f48f7.avif',
  '/src/assets/wallpapers/photo-1572392640988-ba48d1a74457.avif',
  '/src/assets/wallpapers/photo-1515405295579-ba7b45403062.avif',
  '/src/assets/wallpapers/photo-1770944661381-86054cf30749.avif',
  '/src/assets/wallpapers/photo-1778159037079-ea83369df544.avif',
  '/src/assets/wallpapers/photo-1781438587437-c0e4cb48be70.avif',
  '/src/assets/wallpapers/premium_photo-1673292293042-cafd9c8a3ab3.avif',
  '/src/assets/wallpapers/premium_photo-1682050733502-f58b7f499490.avif',
];

export function loadCompanies(user) {
  try {
    const raw = localStorage.getItem(getCompaniesStorageKey(user));
    const companies = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(companies)) return [];
    let changed = false;
    companies.forEach((c, i) => {
      if (!c.color) {
        c.color = CARD_COLORS[i % CARD_COLORS.length];
        changed = true;
      }
    });
    if (changed) saveCompanies(user, companies);
    return companies;
  } catch (error) {
    console.warn('Could not load companies:', error);
    return [];
  }
}

let _companiesSaveHook = null;
export function setCompaniesSaveHook(fn) { _companiesSaveHook = fn; }

export function saveCompanies(user, companies) {
  const key = getCompaniesStorageKey(user);
  localStorage.setItem(key, JSON.stringify(companies));
  _companiesSaveHook?.(user.id, key, companies);
}

export function createCompany(user, name, { employeeCount, package: pkg, notes, members = [] } = {}) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Please enter a company name.');

  const companies = loadCompanies(user);
  const duplicate = companies.some(
    (company) => company.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) throw new Error('This company already exists.');

  const company = {
    id: crypto.randomUUID(),
    name: cleanName,
    color: CARD_COLORS[companies.length % CARD_COLORS.length],
    ...(employeeCount ? { employeeCount: Number(employeeCount) } : {}),
    ...(pkg ? { package: pkg } : {}),
    ...(notes ? { notes: notes.trim() } : {}),
    ...(members.length ? { members } : {}),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  companies.unshift(company);
  saveCompanies(user, companies);
  return company;
}

export function renameCompany(user, companyId, name) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Please enter a company name.');

  const companies = loadCompanies(user);
  const duplicate = companies.some(
    (company) =>
      company.id !== companyId && company.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) throw new Error('This company already exists.');

  const company = companies.find((item) => item.id === companyId);
  if (!company) throw new Error('Company not found.');

  company.name = cleanName;
  company.updatedAt = new Date().toISOString();
  saveCompanies(user, companies);
  return company;
}

export function deleteCompany(user, companyId) {
  const companies = loadCompanies(user);
  const company = companies.find((item) => item.id === companyId);
  if (!company) throw new Error('Company not found.');

  saveCompanies(user, companies.filter((item) => item.id !== companyId));
  localStorage.removeItem(getCompanyStateStorageKey(user, company));
  return company;
}

export function migrateLegacyUserState(user) {
  const companies = loadCompanies(user);
  const legacyKey = getLegacyUserStateStorageKey(user);
  const rawState = localStorage.getItem(legacyKey);
  if (companies.length || !rawState) return false;

  let companyName = 'My Company';
  try {
    const parsed = JSON.parse(rawState);
    companyName = parsed?.project?.customer || parsed?.project?.name || companyName;
  } catch (error) {
    console.warn('Could not inspect legacy state:', error);
  }

  const company = {
    id: crypto.randomUUID(),
    name: companyName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  saveCompanies(user, [company]);
  localStorage.setItem(getCompanyStateStorageKey(user, company), rawState);
  return true;
}
