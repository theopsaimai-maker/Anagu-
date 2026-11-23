import React, { useState } from 'react';
import { AlertCircle, Check, Copy, ExternalLink } from 'lucide-react';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../lib/firestoreRegistry';

interface FirebaseDomainHelpBannerProps {
  hostname: string;
  projectId: string;
}

export function FirebaseDomainHelpBanner({
  hostname,
  projectId
}: FirebaseDomainHelpBannerProps) {
  const [copied, setCopied] = useState(false);

  const settingsUrl = `https://console.firebase.google.com/project/${encodeURIComponent(
    projectId
  )}/authentication/settings`;

  const handleCopyDomain = async () => {
    try {
      await navigator.clipboard.writeText(hostname);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable in restricted context
    }
  };

  return (
    <div
      role="alert"
      className="p-4 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-100 text-xs space-y-3"
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-200">
            Authorize &ldquo;{hostname}&rdquo; in Firebase to enable Google Sign-In
          </p>
          <p className="text-amber-100/80 leading-relaxed">
            Firebase Authentication blocks Google Sign-In on external hosting domains until the
            project owner adds the domain in Firebase Console (project{' '}
            <code className="px-1 py-0.5 rounded bg-slate-950/80 text-emerald-300 font-mono text-[11px]">
              {projectId}
            </code>
            ). Once added, Google Sign-In works immediately with no redeployment needed.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-6">
        <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 font-mono text-[11px] text-white">
          <span>{hostname}</span>
          <button
            type="button"
            onClick={() => void handleCopyDomain()}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 font-sans font-semibold transition-colors"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <a
          href={settingsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors"
        >
          <span>Open Firebase Authorized Domains</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        <a
          href="https://console.firebase.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium transition-colors"
        >
          <span>Firebase Console Home</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <ol className="list-decimal list-inside pl-6 space-y-1 text-[11px] text-amber-100/85">
        <li>
          Sign in to Firebase Console with{' '}
          <span className="font-semibold text-white">{BOOTSTRAPPED_ADMIN_EMAIL}</span> and open
          project <span className="font-semibold text-white">{projectId}</span>.
        </li>
        <li>
          Go to <span className="font-semibold text-white">Build → Authentication → Settings → Authorized domains</span>.
        </li>
        <li>
          Click <span className="font-semibold text-white">Add domain</span>, paste{' '}
          <span className="font-mono text-emerald-300">{hostname}</span>, save, and retry Google
          Sign-In here.
        </li>
      </ol>
    </div>
  );
}
