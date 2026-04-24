'use client'

import Image from 'next/image'

const FANS_URL = 'https://keysborough-district-fans.web.app'

const steps = [
  { n: '1', title: 'Sign up',                  body: 'Register and set a 4-digit PIN.' },
  { n: '2', title: 'Explore',                   body: 'See Upcoming Fixtures, Past Results, Season Stats and Live Scores.' },
  { n: '3', title: 'Vote for Man of the Match', body: 'Go to Fan MOTM tab. You get one vote per team.' },
  { n: '4', title: 'Message the Team',          body: 'Post a message of support on the Team Noticeboard.' },
]

const iosSteps = [
  <>Open <a href={FANS_URL} className="text-blue-600 underline">{FANS_URL}</a> in Safari.</>,
  'Tap the Share button (box with arrow pointing up).',
  'Scroll down and tap "Add to Home Screen".',
  'Tap "Add" in the top-right corner.',
  'Allow notifications — get alerts for goals, half time & full time.',
]

const androidSteps = [
  <>Open <a href={FANS_URL} className="text-blue-600 underline">{FANS_URL}</a> in Chrome.</>,
  'Tap the three-dot menu (⋮) in the top-right.',
  'Tap "Add to Home screen" or "Install app" and confirm.',
  'Open the app from your home screen.',
  'Allow notifications — get alerts for goals, half time & full time.',
]

export default function FanGuidePage() {
  return (
    <>
      <style>{`
        @media print {
          @page { margin: 0; size: A4 portrait; }
          body { margin: 0 !important; }
          .print\\:hidden { display: none !important; }
          .print-root { padding: 8mm !important; }
        }
      `}</style>

      <div className="bg-white">
        <div className="print:hidden fixed top-4 right-4 z-10">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-club-red text-white text-sm font-bold px-4 py-2 rounded-xl shadow-lg hover:bg-club-red/90 transition-colors"
          >
            🖨 Print / Save as PDF
          </button>
        </div>

        <div className="print-root max-w-2xl mx-auto px-3 py-3 space-y-3">

          {/* Header */}
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="KDFC" width={48} height={48} className="rounded-full shrink-0" />
            <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-club-red mb-0.5">Keysborough District FC</div>
            <h1 className="text-2xl font-black text-gray-900 leading-tight">Fan Zone</h1>
            <p className="text-gray-500 mt-1 text-xs leading-relaxed">
              Follow matches live, vote for Man of the Match, and post messages — all from your phone.
            </p>
            </div>
          </div>

          {/* QR code — centred below title */}
          <div className="flex flex-col items-center py-1">
            <div className="relative inline-block">
              <div className="p-2 border-2 border-club-red/20 rounded-xl bg-white">
                <Image src="/QRKDFC.png" alt="QR Code" width={300} height={300} />
              </div>
              {/* Cartoon arrow + label */}
              <div className="absolute -left-20 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <div className="flex flex-col items-center gap-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-club-red">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <span className="text-xs font-black text-club-red whitespace-nowrap" style={{ fontFamily: 'cursive' }}>QR Code</span>
                </div>
                <svg width="48" height="24" viewBox="0 0 48 24" fill="none" className="text-club-red">
                  <path d="M2 12 Q20 2 44 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                  <path d="M38 7 L44 12 L38 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </div>
            </div>
            <p className="text-[9px] text-gray-400 mt-1 font-semibold">Scan to open · {FANS_URL}</p>
          </div>

          <hr className="border-gray-100" />

          {/* How to use */}
          <section>
            <h2 className="text-sm font-black text-gray-900 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-club-red flex items-center justify-center text-white text-[9px] font-black shrink-0">⚽</span>
              How to use the Fan Zone
            </h2>
            <div className="space-y-1.5">
              {steps.map(s => (
                <div key={s.n} className="flex gap-2.5 items-start">
                  <div className="w-5 h-5 rounded-full bg-club-red/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-black text-club-red">{s.n}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-900 text-xs">{s.title} — </span>
                    <span className="text-gray-500 text-xs leading-snug">{s.body}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* Install instructions */}
          <section>
            <h2 className="text-sm font-black text-gray-900 mb-1 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-club-red flex items-center justify-center text-white text-[9px] font-black shrink-0">📲</span>
              Add to your Home Screen — no App Store needed
            </h2>
            <p className="text-[11px] text-gray-400 mb-2">Open in <strong className="text-gray-600">Safari</strong> on iPhone or <strong className="text-gray-600">Chrome</strong> on Android.</p>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="border border-gray-100 rounded-xl p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-sm">🍎</span>
                  <span className="font-black text-gray-900 text-xs">iPhone / iPad</span>
                </div>
                <ol className="space-y-1">
                  {iosSteps.map((s, i) => (
                    <li key={i} className="flex gap-1.5 items-start">
                      <span className="w-3.5 h-3.5 rounded-full bg-gray-100 flex items-center justify-center text-[8px] font-black text-gray-500 shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-[11px] text-gray-600 leading-snug">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="border border-gray-100 rounded-xl p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-sm">🤖</span>
                  <span className="font-black text-gray-900 text-xs">Android</span>
                </div>
                <ol className="space-y-1">
                  {androidSteps.map((s, i) => (
                    <li key={i} className="flex gap-1.5 items-start">
                      <span className="w-3.5 h-3.5 rounded-full bg-gray-100 flex items-center justify-center text-[8px] font-black text-gray-500 shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-[11px] text-gray-600 leading-snug">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          <p className="text-center text-xs text-gray-400 pt-1">
            Chat to <span className="font-semibold text-gray-600">Alex Hofmann (0403 326 837)</span> if you have any questions or ideas on new things to add to the app.
          </p>

        </div>
      </div>
    </>
  )
}
