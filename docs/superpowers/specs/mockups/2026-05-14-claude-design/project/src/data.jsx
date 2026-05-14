/* Mock data — Yank. WhatsApp-y chats and messages. */

const CONTACTS = {
  /* yourself */
  you:    { name: "Tom",            jid: "44 7700 900001@s.whatsapp.net", initials: "TM", color: "var(--accent)" },

  /* work */
  ash:    { name: "Ash R.",         jid: "44 7700 900112",   initials: "AR" },
  marina: { name: "Marina K.",      jid: "44 7700 900421",   initials: "MK" },
  jordan: { name: "Jordan O.",      jid: "44 7700 900133",   initials: "JO" },
  pete:   { name: "Pete N.",        jid: "44 7700 900514",   initials: "PN" },
  client: { name: "Sara @ Brock&Co", jid: "+1 415 555 0142", initials: "SB" },
  freelance: { name: "Yuki I.",     jid: "81 70 0000 0102",  initials: "YI" },

  /* personal */
  mum:    { name: "Mum",            jid: "44 7700 900700",   initials: "MA" },
  dani:   { name: "Dani",           jid: "44 7700 900801",   initials: "DA" },
  flat:   { name: "Flat 4B group",  jid: "120363@g.us",      initials: "4B" },

  /* triage / unknown */
  unknown1: { name: "+34 600 11 22 33",  jid: "+34 600 112233", initials: "??" },
  unknown2: { name: "Recruiter — Edge",   jid: "+1 628 555 0011", initials: "RE" },
  unknown3: { name: "Plumber (Ben)",      jid: "44 7700 905512",  initials: "PB" },
  unknown4: { name: "Conf. organisers",   jid: "120363@g.us",     initials: "CO" },
};

const CHATS = [
  {
    id: "c-brief",
    type: "group",
    title: "AKQA × Brock&Co — Q3 Brief",
    workspace: "work",
    members: 7,
    pinned: true,
    unread: 4,
    online: true,
    mention: true,
    last: "Sara: Pushed v3 of the brief — annotations on slide 12.",
    lastTs: "14:02",
    avatar: "BC",
  },
  {
    id: "c-studio",
    type: "group",
    title: "studio · engineering",
    workspace: "work",
    members: 12,
    pinned: true,
    unread: 7,
    last: "Marina: shipped the staging deploy 🟢",
    lastTs: "13:48",
    avatar: "SE",
  },
  {
    id: "c-design-crit",
    type: "group",
    title: "design-crit",
    workspace: "work",
    members: 9,
    unread: 12,
    muted: true,
    last: "Jordan: shared a frame",
    lastTs: "13:30",
    avatar: "DC",
  },
  {
    id: "c-prj-aurora",
    type: "group",
    title: "prj-aurora",
    workspace: "work",
    members: 6,
    unread: 0,
    mention: true,
    last: "Pete: @tom can you sanity-check the copy on slide 4?",
    lastTs: "12:50",
    avatar: "AU",
  },
  {
    id: "c-all-hands",
    type: "group",
    title: "all-hands",
    workspace: "work",
    members: 48,
    unread: 0,
    last: "Marina: agenda for Thu posted",
    lastTs: "Tue",
    avatar: "AH",
  },
  {
    id: "c-ash",
    type: "dm",
    title: "Ash R.",
    workspace: "work",
    online: true,
    unread: 0,
    last: "you: cool, will look this evening",
    lastTs: "12:11",
    avatar: "AR",
  },
  {
    id: "c-jordan",
    type: "dm",
    title: "Jordan O.",
    workspace: "work",
    unread: 1,
    mention: true,
    last: "Jordan: voice note (0:34)",
    lastTs: "Tue",
    avatar: "JO",
  },
  {
    id: "c-pete",
    type: "dm",
    title: "Pete N.",
    workspace: "work",
    unread: 0,
    last: "you: ✓ approved",
    lastTs: "Tue",
    avatar: "PN",
  },
  {
    id: "c-freelance",
    type: "dm",
    title: "Yuki I.",
    workspace: "work",
    unread: 0,
    muted: true,
    last: "Yuki: invoice attached — INV-0142.pdf",
    lastTs: "Mon",
    avatar: "YI",
  },

  {
    id: "c-dani",
    type: "dm",
    title: "Dani ♥",
    workspace: "personal",
    online: true,
    unread: 2,
    pinned: true,
    last: "Dani: pizza tonight?",
    lastTs: "14:11",
    avatar: "DA",
  },
  {
    id: "c-mum",
    type: "dm",
    title: "Mum",
    workspace: "personal",
    unread: 0,
    last: "Mum: photo",
    lastTs: "11:08",
    avatar: "MA",
  },
  {
    id: "c-flat",
    type: "group",
    title: "Flat 4B 🏠",
    workspace: "personal",
    members: 4,
    unread: 0,
    last: "Alex: who took the bins out 🫠",
    lastTs: "Mon",
    avatar: "4B",
  },
  {
    id: "c-football",
    type: "group",
    title: "5-a-side ⚽️",
    workspace: "personal",
    members: 11,
    unread: 0,
    muted: true,
    last: "Sam: thursday's on, usual time",
    lastTs: "Mon",
    avatar: "5S",
  },
];

const TRIAGE_CHATS = [
  {
    id: "t-unknown1", workspace: "triage", title: "+34 600 11 22 33",
    avatar: "??", last: "hola, is this Tom from AKQA?", lastTs: "13:22",
    preview: [
      { ts: "13:21", txt: "hola, is this Tom from AKQA?" },
      { ts: "13:22", txt: "Carlos passed your number — re: the Lisbon workshop" },
      { ts: "13:22", txt: "happy to jump on a call this week if useful" },
    ],
  },
  {
    id: "t-recruiter", workspace: "triage", title: "Edge Talent — Priya",
    avatar: "RE", last: "Senior Design Eng role, fully remote, £…", lastTs: "11:46",
    preview: [
      { ts: "11:45", txt: "Hi Tom! Priya from Edge Talent." },
      { ts: "11:45", txt: "We have a Senior Design Eng role, fully remote, £140k-160k base + equity." },
      { ts: "11:46", txt: "Worth a 15-min chat?" },
    ],
  },
  {
    id: "t-plumber", workspace: "triage", title: "Ben (plumber)",
    avatar: "PB", last: "can come Thursday 9-11", lastTs: "10:02",
    preview: [
      { ts: "09:58", txt: "morning — Ben here, the plumber" },
      { ts: "10:01", txt: "got your number from your landlord" },
      { ts: "10:02", txt: "can come Thursday 9-11 for the leak" },
    ],
  },
  {
    id: "t-conf", workspace: "triage", title: "Config 2026 organisers",
    avatar: "CO", last: "Speaker pack attached.", lastTs: "Mon",
    preview: [
      { ts: "Mon 17:30", txt: "Welcome to Config 2026 speakers!" },
      { ts: "Mon 17:30", txt: "Speaker pack attached (PDF, 4.2MB)." },
      { ts: "Mon 17:31", txt: "Rehearsal slot link → cfg26.com/r/tom" },
    ],
  },
];

/* Message thread for c-brief (the active chat in mockups) */
const MESSAGES_BRIEF = [
  { day: "Today" },
  {
    id: "m-1", sender: "ash", ts: "09:14", showHead: true,
    text: "Morning — uploaded the v3 brief to Drive. Key thing on slide 12: Brock&Co want us to lean into the **subscription** angle, not the one-off retail purchase.",
  },
  {
    id: "m-2", sender: "ash", ts: "09:14",
    text: "Their language: 'rituals not transactions'. Could be a north star for the campaign.",
  },
  {
    id: "m-3", sender: "marina", ts: "09:21", showHead: true,
    text: "Love that. Mark — how does this play with the retail-launch sequencing? @marina",
    mention: "marina",
    reactions: [{ e: "👀", n: 2 }, { e: "🔥", n: 1, mine: true }],
  },
  {
    id: "m-4", sender: "jordan", ts: "09:34", role: "admin", showHead: true,
    quote: { author: "Ash R.", text: "Their language: 'rituals not transactions'…" },
    text: "Strong. I'll thread the concept boards in here — give me until lunch.",
    threadCount: 6, threadPeople: ["ash", "marina", "you"], threadLast: "21m",
  },
  {
    id: "m-5", sender: "pete", ts: "11:02", showHead: true,
    text: "Concept board v1 →",
    media: { kind: "image", aspect: "16/10", label: "concept-board-v1.png" },
  },
  {
    id: "m-6", sender: "pete", ts: "11:02",
    media: { kind: "image", aspect: "4/3", label: "swatches-warm.png" },
  },
  {
    id: "m-7", sender: "client", ts: "11:48", role: "client", showHead: true,
    text: "These are gorgeous. Two notes:\n1. The amber is a touch saturated for the packaging context.\n2. Can we see a treatment with the wordmark integrated, not stacked?",
    reactions: [{ e: "🙏", n: 3 }, { e: "✅", n: 1 }],
  },
  {
    id: "m-8", sender: "system", ts: "12:14",
    system: "Marina K. added Yuki I. to this group",
  },
  {
    id: "m-9", sender: "you", ts: "13:31", showHead: true,
    text: "Good notes. We'll bring two amber variations and integrated wordmark options to tomorrow's review. @ash can you flag the desat range to Pete?",
    mention: "ash",
    status: "read",
  },
  {
    id: "m-10", sender: "ash", ts: "13:55", showHead: true,
    voice: { dur: "0:34", played: 12 },
  },
  {
    id: "m-11", sender: "client", ts: "14:01", showHead: true,
    text: "Tomorrow's review — pushed to 11:00 my time, sorry. Calendar updated.",
  },
  {
    id: "m-12", sender: "client", ts: "14:02",
    doc: { name: "Brock_Co_Brief_v3_annotated.pdf", size: "4.2 MB", ext: "PDF" },
  },
];

/* Thread messages for m-4 */
const THREAD_M4 = [
  {
    id: "t-m4-1", sender: "marina", ts: "09:42", showHead: true,
    text: "Could we get the boards in 3:4 too? The deck template is portrait this round.",
  },
  {
    id: "t-m4-2", sender: "jordan", ts: "09:44", showHead: true,
    text: "Yep, exporting both. ETA 12:30.",
    reactions: [{ e: "👍", n: 1, mine: true }],
  },
  {
    id: "t-m4-3", sender: "ash", ts: "10:01", showHead: true,
    text: "Quick aside — which of the three lockups did Sara prefer in the call?",
  },
  {
    id: "t-m4-4", sender: "you", ts: "10:08", showHead: true,
    text: "The middle one (serif → sans pairing). She said 'felt warmer'.",
    status: "read",
  },
  {
    id: "t-m4-5", sender: "jordan", ts: "12:34", showHead: true,
    media: { kind: "image", aspect: "3/4", label: "lockup-portrait-v2.png" },
  },
  {
    id: "t-m4-6", sender: "marina", ts: "13:15", showHead: true,
    text: "Perfect. Threading these into the brief doc.",
    reactions: [{ e: "🙏", n: 1 }],
  },
];

const SEARCH_RESULTS = [
  {
    chat: "AKQA × Brock&Co — Q3 Brief", sender: "client", when: "14:02",
    snippet: "Tomorrow's review — pushed to <mark>11:00</mark> my time, sorry. Calendar updated.",
  },
  {
    chat: "AKQA × Brock&Co — Q3 Brief", sender: "ash", when: "09:14",
    snippet: "Their language: '<mark>rituals not transactions</mark>'. Could be a north star for the campaign.",
  },
  {
    chat: "Studio · engineering", sender: "marina", when: "Tue 16:22",
    snippet: "Just FYI: deploy <mark>review-app</mark> URLs are now per-PR, not per-branch.",
  },
  {
    chat: "Yuki I.", sender: "freelance", when: "Mon 09:14",
    snippet: "Sending the <mark>review</mark> invoice today — paid net-30 still ok?",
  },
  {
    chat: "AKQA × Brock&Co — Q3 Brief", sender: "marina", when: "Mon 15:30",
    snippet: "Calendar: rescheduling the Thursday <mark>review</mark> to next Tuesday morning.",
  },
];

const SAVED = [
  {
    sender: "ash", when: "Tue 14:08", where: "in AKQA × Brock&Co",
    text: "rituals not transactions — keep this as the north star wording for the campaign deck.",
  },
  {
    sender: "marina", when: "Mon 11:42", where: "in Studio · engineering",
    text: "Reminder: never `npm install -g` in CI. Use the lockfile.",
    code: true,
  },
  {
    sender: "client", when: "May 09", where: "in AKQA × Brock&Co",
    text: "Working address for sample shipping:\nBrock & Co\nThe Loft, 42 Vine St\nLondon EC2A 4DQ",
  },
  {
    sender: "dani", when: "May 06", where: "in Dani ♥",
    text: "tomato risotto, white wine, low heat — that's all I'm saying",
  },
];

window.DATA = { CONTACTS, CHATS, TRIAGE_CHATS, MESSAGES_BRIEF, THREAD_M4, SEARCH_RESULTS, SAVED };
