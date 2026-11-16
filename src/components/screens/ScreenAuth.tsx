import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  Eye,
  EyeOff,
  FileText,
  Lock,
  Mail,
  ShieldCheck,
  User,
  Users,
  AlertCircle
} from 'lucide-react';
import { AccessRoleId, AuthMode, AuthUser } from '../../types/anagu';
import { ASSET_IMAGES } from '../../data/mockData';
import { apiDemoLogin, apiLogin, apiSignup, isBackendUnavailableError } from '../../lib/api';

export interface StoredAuthAccount extends AuthUser {
  password: string;
}

export const INITIAL_DEMO_ACCOUNTS: StoredAuthAccount[] = [
  {
    id: 'usr-citizen-01',
    fullName: 'Dr. Aminu Bello Abubakar',
    email: 'aminu.bello@anagu.ng',
    phone: '+234 803 412 8890',
    role: 'citizen',
    state: 'Federal Capital Territory (Abuja)',
    credentialId: 'NIN-8921-4091-2311',
    password: 'anagu-citizen',
    createdAt: '2026-06-12'
  },
  {
    id: 'usr-surveyor-01',
    fullName: 'Musa Adeleke',
    email: 'musa.adeleke@nis-survey.ng',
    phone: '+234 805 901 3342',
    role: 'surveyor',
    state: 'Federal Capital Territory (Abuja)',
    credentialId: 'SURCON-NIS-4821',
    password: 'anagu-surveyor',
    createdAt: '2026-05-04'
  },
  {
    id: 'usr-oracle-01',
    fullName: 'Chief Chukwudi Nnamdi Eze',
    email: 'chief.eze@oracle-council.ng',
    phone: '+234 809 774 1120',
    role: 'oracle',
    state: 'Enugu State',
    credentialId: 'Council Elder · Ogui Nike Royal Quorum',
    password: 'anagu-oracle',
    createdAt: '2026-04-19'
  }
];

interface Props {
  initialMode: AuthMode;
  initialRole?: AccessRoleId;
  accounts: StoredAuthAccount[];
  onAuthSuccess: (user: AuthUser) => void;
  onRegisterAccount: (account: StoredAuthAccount) => void;
  onBackToLanding: () => void;
}

const ROLE_META: Record<
  AccessRoleId,
  {
    label: string;
    portalTitle: string;
    credentialLabel: string;
    credentialPlaceholder: string;
    scopeNote: string;
    image: string;
    imageAlt: string;
    accentText: string;
    accentRing: string;
    icon: React.ComponentType<{ className?: string }>;
    highlights: string[];
  }
> = {
  citizen: {
    label: 'Citizen & Landowner',
    portalTitle: 'Citizen Application Portal',
    credentialLabel: 'National Identification Number (NIN)',
    credentialPlaceholder: 'NIN-8921-4091-2311',
    scopeNote: 'Submit beacon surveys, track live title verification, and print digital C of O deeds.',
    image: ASSET_IMAGES.bentoGovernance,
    imageAlt: 'Citizen land ownership portal preview',
    accentText: 'text-emerald-400',
    accentRing: 'border-emerald-500 bg-emerald-950/50 text-white',
    icon: FileText,
    highlights: [
      'Lodge new plot beacons & survey plan references',
      'Track surveyor GIS & elder council approvals live',
      'Download QR-verifiable Certificate of Occupancy deeds'
    ]
  },
  surveyor: {
    label: 'Surveyor & GIS',
    portalTitle: 'Surveyor GIS Map',
    credentialLabel: 'SURCON / NIS License Number',
    credentialPlaceholder: 'SURCON-NIS-4821',
    scopeNote: 'Inspect polygon beacons on satellite overlays and certify zero boundary encroachment.',
    image: ASSET_IMAGES.bentoCadastre,
    imageAlt: 'Satellite cadastral GIS boundary map',
    accentText: 'text-sky-400',
    accentRing: 'border-sky-500 bg-sky-950/50 text-white',
    icon: Compass,
    highlights: [
      'Inspect parcel coordinates against national cadastre grid',
      'Run automated overlap & collision checks before approval',
      'Certify spatial clearance to unlock Community Oracle review'
    ]
  },
  oracle: {
    label: 'Community Oracle',
    portalTitle: 'Community Oracle Council',
    credentialLabel: 'Traditional Council / Chieftaincy Title',
    credentialPlaceholder: 'Village Head · Katampe Traditional Council',
    scopeNote: 'Attest ancestral family lineage and prevent unauthorized secret community land sales.',
    image: ASSET_IMAGES.oracleElders,
    imageAlt: 'Community Oracle traditional council attestation',
    accentText: 'text-amber-400',
    accentRing: 'border-amber-500 bg-amber-950/50 text-white',
    icon: Users,
    highlights: [
      'Audit family genealogy & customary witness documentation',
      'Record multi-elder quorum consent under LUA Section 36',
      'Flag disputed boundaries before statutory grant issuance'
    ]
  }
};

export const ScreenAuth: React.FC<Props> = ({
  initialMode,
  initialRole = 'citizen',
  accounts,
  onAuthSuccess,
  onRegisterAccount,
  onBackToLanding
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [selectedRole, setSelectedRole] = useState<AccessRoleId>(initialRole);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Sign up form state
  const [fullName, setFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [stateJurisdiction, setStateJurisdiction] = useState('Federal Capital Territory (Abuja)');
  const [credentialId, setCredentialId] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(true);

  const [imageBroken, setImageBroken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roleInfo = ROLE_META[selectedRole];
  const RoleIcon = roleInfo.icon;

  const handleSwitchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMsg('');
    setShowForgotHelp(false);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const normalizedEmail = loginEmail.trim().toLowerCase();
    if (!normalizedEmail || !loginPassword) {
      setErrorMsg('Please enter both your registered email address and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await apiLogin(normalizedEmail, loginPassword);
      onAuthSuccess(user);
    } catch (err) {
      const found = accounts.find((acc) => acc.email.toLowerCase() === normalizedEmail);
      if (found && found.password === loginPassword) {
        const { password: _removed, ...safeUser } = found;
        void _removed;
        onAuthSuccess(safeUser);
      } else if (isBackendUnavailableError(err)) {
        if (found) {
          setErrorMsg('Incorrect password. Please check your password or use a verified sample profile below.');
        } else {
          setErrorMsg('No Anagu account was found for that email. Switch to Sign Up to create an account.');
        }
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Invalid email or password. Please check your credentials or use a verified sample profile below.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = fullName.trim();
    const normalizedEmail = signupEmail.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const trimmedCred = credentialId.trim();

    if (!trimmedName || !normalizedEmail || !trimmedPhone || !trimmedCred) {
      setErrorMsg('Please complete all required identity and statutory credential fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (signupPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }
    if (signupPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please confirm your password.');
      return;
    }
    if (!acceptedTerms) {
      setErrorMsg('Please confirm statutory compliance under the Land Use Act before creating an account.');
      return;
    }

    setIsSubmitting(true);
    try {
      const createdUser = await apiSignup({
        fullName: trimmedName,
        email: normalizedEmail,
        phone: trimmedPhone,
        role: selectedRole,
        state: stateJurisdiction,
        credentialId: trimmedCred,
        password: signupPassword
      });
      onRegisterAccount({ ...createdUser, password: signupPassword });
      onAuthSuccess(createdUser);
    } catch (err) {
      const alreadyExists = accounts.some((acc) => acc.email.toLowerCase() === normalizedEmail);
      if (isBackendUnavailableError(err)) {
        if (alreadyExists) {
          setErrorMsg('An account with this email already exists. Please sign in instead.');
        } else {
          const localUser: AuthUser = {
            id: `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            fullName: trimmedName,
            email: normalizedEmail,
            phone: trimmedPhone,
            role: selectedRole,
            state: stateJurisdiction,
            credentialId: trimmedCred,
            createdAt: new Date().toISOString().slice(0, 10)
          };
          onRegisterAccount({ ...localUser, password: signupPassword });
          onAuthSuccess(localUser);
        }
      } else {
        const message = err instanceof Error ? err.message : 'Unable to create account.';
        if (message.toLowerCase().includes('already exists') || alreadyExists) {
          setErrorMsg('An account with this email already exists. Please sign in instead.');
        } else {
          setErrorMsg(message);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoSignIn = async (role: AccessRoleId) => {
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const user = await apiDemoLogin(role);
      onAuthSuccess(user);
    } catch {
      const demoAccount = accounts.find((a) => a.role === role) || INITIAL_DEMO_ACCOUNTS[0];
      const { password: _removed, ...safeUser } = demoAccount;
      void _removed;
      onAuthSuccess(safeUser);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Clean 3-Zone Top Bar */}
      <header className="bg-[#070b12]/95 backdrop-blur-md border-b border-slate-800/80 px-6 lg:px-12 h-18 flex items-center justify-between gap-8 shrink-0">
        <button
          type="button"
          onClick={onBackToLanding}
          className="flex items-center gap-3 cursor-pointer shrink-0 group text-left"
        >
          <div className="w-10 h-10 rounded-full p-0.5 bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400 shadow-md shrink-0 group-hover:scale-105 transition-transform duration-200">
            <img
              src={ASSET_IMAGES.logoAvatar}
              alt="Anagu Emblem"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-full bg-slate-900"
            />
          </div>
          <span className="text-xl font-bold tracking-tight text-white whitespace-nowrap">
            Anagu
          </span>
        </button>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <button
            type="button"
            onClick={() => handleSwitchMode('login')}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              mode === 'login' ? 'text-emerald-400 font-semibold' : 'hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('signup')}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              mode === 'signup' ? 'text-emerald-400 font-semibold' : 'hover:text-white'
            }`}
          >
            Create Account
          </button>
        </nav>

        <button
          type="button"
          onClick={onBackToLanding}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Landing</span>
        </button>
      </header>

      {/* Main Split Viewport */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 lg:px-12 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
        {/* Left Column: Role Context & Visual Anchor */}
        <section className="lg:col-span-5 flex flex-col justify-between bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="relative h-64 lg:h-72 bg-gradient-to-br from-slate-900 via-emerald-950/40 to-slate-950 overflow-hidden">
            {!imageBroken ? (
              <img
                src={roleInfo.image}
                alt={roleInfo.imageAlt}
                referrerPolicy="no-referrer"
                onError={() => setImageBroken(true)}
                className="w-full h-full object-cover object-center opacity-90"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-400 p-6">
                <RoleIcon className={`w-10 h-10 ${roleInfo.accentText}`} />
                <span className="text-xs font-medium">{roleInfo.portalTitle}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent" />
            <div className="absolute bottom-5 left-6 right-6 space-y-1">
              <div className={`text-xs font-semibold tracking-wide ${roleInfo.accentText}`}>
                Role Access · {roleInfo.label}
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight text-balance">
                {roleInfo.portalTitle}
              </h2>
            </div>
          </div>

          <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <p className="text-sm text-slate-300 leading-relaxed">
                {roleInfo.scopeNote}
              </p>

              <div className="pt-4 border-t border-slate-800 space-y-3">
                <div className="text-xs font-semibold text-slate-400">
                  Authorized capabilities for this role
                </div>
                <ul className="space-y-2.5 text-xs sm:text-sm text-slate-200">
                  {roleInfo.highlights.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check className={`w-4 h-4 shrink-0 mt-0.5 ${roleInfo.accentText}`} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center gap-3 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Protected under Nigerian Land Use Act (1978) &amp; Survey Standards</span>
            </div>
          </div>
        </section>

        {/* Right Column: Auth Form Card */}
        <section className="lg:col-span-7 bg-slate-900 rounded-2xl border border-slate-800 p-6 sm:p-10 flex flex-col justify-between space-y-8">
          <div className="space-y-6">
            {/* Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text-balance">
                  {mode === 'login' ? 'Sign In to Anagu Registry' : 'Create Registry Account'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-400">
                  {mode === 'login'
                    ? 'Enter your credentials or select a verified role profile to continue.'
                    : 'Register your statutory role to access citizen filings, GIS checks, or elder attestations.'}
                </p>
              </div>

              <div
                className="inline-flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl shrink-0 self-start"
                role="tablist"
                aria-label="Authentication mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  onClick={() => handleSwitchMode('login')}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    mode === 'login'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  onClick={() => handleSwitchMode('signup')}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    mode === 'signup'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sign Up
                </button>
              </div>
            </div>

            {/* Role Selector */}
            <div className="space-y-2.5">
              <span className="text-xs font-semibold text-slate-300 block">
                Select Access Category
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(Object.keys(ROLE_META) as AccessRoleId[]).map((roleKey) => {
                  const item = ROLE_META[roleKey];
                  const Icon = item.icon;
                  const active = selectedRole === roleKey;
                  return (
                    <button
                      key={roleKey}
                      type="button"
                      onClick={() => {
                        setSelectedRole(roleKey);
                        setImageBroken(false);
                        setErrorMsg('');
                      }}
                      className={`px-3.5 py-3 rounded-xl border text-left transition-all flex items-center gap-2.5 min-h-[44px] ${
                        active
                          ? item.accentRing
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? item.accentText : 'text-slate-400'}`} />
                      <span className="text-xs font-semibold whitespace-nowrap truncate">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Validation Error Feedback */}
            {errorMsg && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* LOGIN FORM */}
            {mode === 'login' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="login-email" className="text-xs font-medium text-slate-300 block">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-email"
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="name@example.ng"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="text-xs font-medium text-slate-300">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotHelp((prev) => !prev)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-11 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {showForgotHelp && (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                    <div className="font-semibold text-white">Demo Credential Reference</div>
                    <div>Citizen: <span className="font-mono text-emerald-400">aminu.bello@anagu.ng</span> / <span className="font-mono">anagu-citizen</span></div>
                    <div>Surveyor: <span className="font-mono text-sky-400">musa.adeleke@nis-survey.ng</span> / <span className="font-mono">anagu-surveyor</span></div>
                    <div>Oracle Elder: <span className="font-mono text-amber-400">chief.eze@oracle-council.ng</span> / <span className="font-mono">anagu-oracle</span></div>
                  </div>
                )}

                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 accent-emerald-600"
                  />
                  <span>Keep me signed in on this device</span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <span>{isSubmitting ? 'Signing In...' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              /* SIGN UP FORM */
              <form onSubmit={handleSignupSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="signup-name" className="text-xs font-medium text-slate-300 block">
                      Full Legal Name *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="signup-name"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Zainab Yusuf Danjuma"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="signup-phone" className="text-xs font-medium text-slate-300 block">
                      Phone Number *
                    </label>
                    <input
                      id="signup-phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+234 803 123 4567"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="signup-email" className="text-xs font-medium text-slate-300 block">
                      Email Address *
                    </label>
                    <input
                      id="signup-email"
                      type="email"
                      required
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="name@example.ng"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="signup-state" className="text-xs font-medium text-slate-300 block">
                      State Jurisdiction *
                    </label>
                    <select
                      id="signup-state"
                      value={stateJurisdiction}
                      onChange={(e) => setStateJurisdiction(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="Federal Capital Territory (Abuja)">Federal Capital Territory (Abuja)</option>
                      <option value="Lagos State">Lagos State</option>
                      <option value="Enugu State">Enugu State</option>
                      <option value="Ogun State">Ogun State</option>
                      <option value="Kano State">Kano State</option>
                      <option value="Rivers State">Rivers State</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="signup-cred" className="text-xs font-medium text-slate-300 block">
                    {roleInfo.credentialLabel} *
                  </label>
                  <input
                    id="signup-cred"
                    type="text"
                    required
                    value={credentialId}
                    onChange={(e) => setCredentialId(e.target.value)}
                    placeholder={roleInfo.credentialPlaceholder}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="signup-password" className="text-xs font-medium text-slate-300 block">
                      Password (min. 6 characters) *
                    </label>
                    <div className="relative">
                      <input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        placeholder="Create a password"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="signup-confirm" className="text-xs font-medium text-slate-300 block">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <input
                        id="signup-confirm"
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat your password"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-700 bg-slate-950 accent-emerald-600 shrink-0"
                  />
                  <span>
                    I attest that the statutory details provided comply with the Nigerian Land Use Act (1978) and Survey Act records.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <span>
                    {isSubmitting ? 'Creating Account...' : `Create Account & Enter ${roleInfo.portalTitle}`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>

          {/* One-Click Verified Role Entry Footer */}
          <div className="pt-6 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Quick entry with a verified sample profile</span>
              <button
                type="button"
                onClick={() => handleSwitchMode(mode === 'login' ? 'signup' : 'login')}
                className="text-emerald-400 hover:text-emerald-300 font-semibold"
              >
                {mode === 'login' ? 'Need an account? Sign Up' : 'Already registered? Sign In'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => handleDemoSignIn('citizen')}
                className="px-3 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/60 rounded-xl text-xs font-semibold text-slate-200 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Demo Citizen</span>
              </button>
              <button
                type="button"
                onClick={() => handleDemoSignIn('surveyor')}
                className="px-3 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/60 rounded-xl text-xs font-semibold text-slate-200 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Compass className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Demo Surveyor</span>
              </button>
              <button
                type="button"
                onClick={() => handleDemoSignIn('oracle')}
                className="px-3 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/60 rounded-xl text-xs font-semibold text-slate-200 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Demo Elder</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
