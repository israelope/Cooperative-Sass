// Single source of truth for the public Help centre and the in-app "?" links.
// Plain data on purpose: edit a sentence here and every guide updates.

export const ROLES = [
  {
    id: 'admin',
    label: 'Cooperative admin',
    shortLabel: 'Admin',
    icon: 'settings',
    image: '/images/admin-meeting.jpg',
    imageAlt: 'Cooperative officers planning together around a laptop',
    audience: 'The officer who registered the society and manages it.',
    summary: 'Set up the workspace, bring your members in, and keep an eye on all the money.',
    steps: [
      {
        id: 'start',
        title: 'Find your way around',
        icon: 'dashboard',
        body: "After registration you land on the cooperative dashboard. The left sidebar lists every page (on a phone, tap 'More'). The dashboard shows active members, total savings, collections, loans and anything waiting for your attention.",
        links: [{ href: '/admin', label: 'Open the dashboard' }],
      },
      {
        id: 'setup',
        title: 'Set up payout details',
        icon: 'bank',
        body: 'In Settings, add the cooperative bank account that online payments should reach, and check your society rules such as the loan multiplier. You can do this whenever you are ready — the rest of the app works without it.',
        links: [{ href: '/admin/settings', label: 'Open Settings' }],
      },
      {
        id: 'members',
        title: 'Bring your members in',
        icon: 'users',
        body: "There are three ways in. Share your society link ( /your-society ) so members can join themselves; use Bulk import to bring over a spreadsheet from paper records; or add someone directly. Each member needs to be approved by an officer before they can pay or borrow. Pending members can look around but cannot transact yet.",
        links: [
          { href: '/admin/members', label: 'Review members' },
          { href: '/admin/import', label: 'Bulk import' },
        ],
        note: 'Bulk import is available to admins only. Bookkeepers can view members but cannot add them in bulk.',
      },
      {
        id: 'payments',
        title: 'Understand money coming in',
        icon: 'wallet',
        body: "Online contributions and loan repayments post themselves once Paystack confirms them — nothing to copy by hand. For cash or bank transfers, use 'Record a payment' and attach the receipt. Every entry appears on the member's passbook and in your Payments list.",
        links: [
          { href: '/admin/payments/record', label: 'Record a payment' },
          { href: '/admin/payments', label: 'All payments' },
          { href: '/admin/reconciliation', label: 'Reconciliation' },
        ],
      },
      {
        id: 'loans',
        title: 'Handle loans',
        icon: 'bank',
        body: "A member's limit is their savings multiplied by your society's multiplier, minus anything they still owe. You decide on requests here. CoopLedger tracks the loan but never moves money: after approval, transfer the funds yourself and then mark the loan as paid out.",
        links: [{ href: '/admin/loans', label: 'Open Loans' }],
      },
      {
        id: 'plans',
        title: 'Savings plans and gentle nudges',
        icon: 'calendar',
        body: 'Members can set their own recurring contribution schedule. You can see who has a plan and who is behind, and send an in-app nudge. Payments are still made by the member themselves.',
        links: [{ href: '/admin/contributions', label: 'See savings plans' }],
      },
      {
        id: 'statements',
        title: 'Produce statements and exports',
        icon: 'fileText',
        body: "Download your cooperative's statement as a PDF for any period: collections by channel, every member's savings and loan balance, and every payment. Members can download their own passbook PDF at any time.",
        links: [{ href: '/admin/statements', label: 'Open Statements' }],
      },
      {
        id: 'team',
        title: 'Admins and bookkeepers',
        icon: 'users',
        body: 'Use Team to add staff and change roles. Admins can manage Team, Bulk import and Settings. Bookkeepers share the same workspace and focus on day-to-day records: Cashbook, recording payments, Reconciliation and Statements.',
        links: [{ href: '/admin/team', label: 'Manage your team' }],
      },
    ],
  },
  {
    id: 'bookkeeper',
    label: 'Bookkeeper',
    shortLabel: 'Bookkeeper',
    icon: 'receipt',
    image: '/images/bookkeeper-records.jpg',
    imageAlt: 'A bookkeeper checking receipts and recording expenses',
    audience: 'The officer who records day-to-day money movement and keeps the books tidy.',
    summary: 'Record cash and transfers, reconcile online payments, and produce statements.',
    steps: [
      {
        id: 'role',
        title: 'Your workspace',
        icon: 'dashboard',
        body: "You share the cooperative's dashboard with the admin. Your tools are Payments, Record a payment, Cashbook, Reconciliation and Statements. Team, Bulk import and Settings are admin-only, and that is intentional — not a broken link.",
        links: [{ href: '/admin', label: 'Open the dashboard' }],
      },
      {
        id: 'record',
        title: 'Record a cash or transfer payment',
        icon: 'plusCircle',
        body: "Use 'Record a payment' for money that did not arrive through Paystack. Choose the member, amount and channel, and attach a photo of the receipt. Once saved, the entry appears on the member's passbook for them to see.",
        links: [{ href: '/admin/payments/record', label: 'Record a payment' }],
      },
      {
        id: 'cashbook',
        title: 'Keep the cashbook',
        icon: 'bank',
        body: 'Record cooperative expenses, other income and transfers here. Member contributions and loan payouts are already included automatically, so you only add the entries the app cannot see on its own.',
        links: [{ href: '/admin/cashbook', label: 'Open Cashbook' }],
      },
      {
        id: 'reconciliation',
        title: 'Resolve anything out of the ordinary',
        icon: 'refresh',
        body: 'Every online payment is checked against what Paystack reports. If something needs a human decision it appears in Reconciliation. When nothing is listed, you are all caught up.',
        links: [{ href: '/admin/reconciliation', label: 'Open Reconciliation' }],
      },
      {
        id: 'members',
        title: 'Look up a member',
        icon: 'users',
        body: 'Find a member to see their number, contact details, status and passbook entries. If their status says pending or suspended, an admin needs to approve or reactivate them before they can transact.',
        links: [{ href: '/admin/members', label: 'Open Members' }],
      },
      {
        id: 'statements',
        title: 'Issue statements',
        icon: 'fileText',
        body: 'Download a PDF statement for any period, or export a CSV ledger of payments. Use the filters on the Statements page to choose the dates you need.',
        links: [{ href: '/admin/statements', label: 'Open Statements' }],
      },
    ],
  },
  {
    id: 'member',
    label: 'Member',
    shortLabel: 'Member',
    icon: 'wallet',
    image: '/images/member-payment.jpg',
    imageAlt: 'A member paying a contribution with a smartphone',
    audience: 'A person saving and borrowing through the cooperative.',
    summary: 'Pay your contributions, check your passbook, and see what you can borrow.',
    steps: [
      {
        id: 'start',
        title: 'Get into your account',
        icon: 'ticket',
        body: "Your officers will give you either a join link or a claim code. A join link creates a new account; a claim code activates an account they created for you and works once. After signing up, an officer must approve your membership — while it says 'pending' you can look around, but paying and borrowing are not open yet.",
        links: [
          { href: '/claim', label: 'Use a claim code' },
          { href: '/login', label: 'Log in' },
        ],
      },
      {
        id: 'home',
        title: 'Your home page',
        icon: 'home',
        body: 'Your savings balance, how much you can borrow, the rule used to calculate it, and your latest passbook entries are all on the home page. The loan-used bar shows how much of your limit is already outstanding.',
        links: [{ href: '/member', label: 'Go home' }],
      },
      {
        id: 'pay',
        title: 'Pay a contribution',
        icon: 'wallet',
        body: 'Pay online and the entry appears in your passbook automatically after confirmation. If you paid an officer in cash, they record it with a receipt and it appears here too. The payment status page tells you if a payment is still being confirmed.',
        links: [{ href: '/member/pay', label: 'Pay a contribution' }],
      },
      {
        id: 'passbook',
        title: 'Read your passbook',
        icon: 'book',
        body: 'Every entry is listed newest first, with its date, description, amount and running balance. Entries are never edited: a correction appears as a new line so the history stays honest. Download your own PDF statement from this page.',
        links: [{ href: '/member/passbook', label: 'Open Passbook' }],
      },
      {
        id: 'loans',
        title: 'Loans and repayments',
        icon: 'bank',
        body: "Your limit is your savings times your cooperative's multiplier, minus what you still owe. Request a loan here and an officer will decide. CoopLedger tracks the loan but the money is transferred by the cooperative; once approved and paid out, make repayments through the same page.",
        links: [{ href: '/member/loans', label: 'Open Loans' }],
      },
      {
        id: 'plans',
        title: 'Set a savings plan',
        icon: 'calendar',
        body: 'Choose a schedule and the app will remind you in-app when it is time to pay. It does not take money automatically — you still make each payment yourself.',
        links: [{ href: '/member/contributions', label: 'Open Savings plan' }],
      },
      {
        id: 'goals',
        title: 'Set a goal',
        icon: 'trendingUp',
        body: 'Pick a target amount and watch your real passbook balance carry you towards it. The progress is calculated from your savings, not typed in by hand.',
        links: [{ href: '/member/goals', label: 'Open My goal' }],
      },
      {
        id: 'card',
        title: 'Your membership card',
        icon: 'card',
        body: 'Your digital identity in this cooperative. Show your membership number to an officer when you pay in cash so they can credit the right passbook.',
        links: [{ href: '/member/card', label: 'Open Membership card' }],
      },
      {
        id: 'notifications',
        title: 'Notifications',
        icon: 'mail',
        body: 'Payment confirmations, loan updates and announcements from your cooperative all land here. The bell in the sidebar shows how many you have not read.',
        links: [{ href: '/member/notifications', label: 'Open Notifications' }],
      },
    ],
  },
];

export const GLOSSARY = [
  { term: 'Passbook', definition: 'A member\u2019s running record of savings, contributions, loans and repayments, with a balance after every entry. Entries are never edited; corrections are added as new lines.' },
  { term: 'Contribution', definition: 'Money a member pays into the cooperative, either online or in cash through a bookkeeper.' },
  { term: 'Claim code', definition: 'A one-time code an officer gives a member to activate an account that was created for them. It is different from a join link, which creates a new account.' },
  { term: 'Pending member', definition: 'A member who has signed up but not yet been approved by an officer. They can look around but cannot pay or borrow.' },
  { term: 'Loan limit', definition: 'How much a member can borrow: their savings multiplied by the cooperative\u2019s multiplier, minus any loan still outstanding.' },
  { term: 'Savings plan', definition: 'A schedule a member chooses for recurring contributions. It sends an in-app reminder; it never deducts money automatically.' },
  { term: 'Reconciliation', definition: 'Checking online payments against what Paystack reports, so anything unusual can be reviewed by a person.' },
  { term: 'Cashbook', definition: 'The cooperative\u2019s own record of expenses, other income and transfers. Member contributions and loan payouts are included automatically.' },
  { term: 'Payout / bank details', definition: 'The cooperative bank account an admin adds in Settings. Online contributions are paid into this account.' },
  { term: 'Workspace / tenant', definition: 'One cooperative\u2019s private area of the platform. Each workspace is walled off from every other one at the database level.' },
  { term: 'Settlement', definition: 'The transfer of confirmed online payments from Paystack to the cooperative\u2019s bank account.' },
  { term: 'Suspended', definition: 'Access paused by an officer. The member or cooperative cannot use the app until it is reactivated.' },
];

export const FAQS = [
  {
    q: 'What is CoopLedger?',
    a: 'A private online workspace for a thrift or credit society. Members see their savings and loan limit, pay contributions, and download statements. Officers record payments and keep the books without copying bank alerts by hand.',
  },
  {
    q: 'How does a member join?',
    a: 'An admin shares the society link ( /your-society ), where a member can create an account, or gives the member a one-time claim code to activate an account already created for them. An officer must approve the membership before they can transact.',
  },
  {
    q: 'Can we still use cash and bank transfers?',
    a: 'Yes. A bookkeeper records the payment and attaches a photo of the receipt. It appears on the member\u2019s passbook just like an online payment. Only online payments carry a platform fee.',
  },
  {
    q: 'Why can\u2019t a new member pay yet?',
    a: 'Their account says pending until an officer approves it. Go to Members, filter by pending, and approve them. They can look around the app in the meantime.',
  },
  {
    q: 'Who can see our records?',
    a: 'Only people in your own cooperative workspace. The database enforces the separation, so one society can never see another society\u2019s members or money.',
  },
  {
    q: 'Who approves loans and pays them out?',
    a: 'Your cooperative officers do. CoopLedger calculates the limit, tracks requests and repayments, but it never moves loan money. After approving, transfer the funds yourselves and mark the loan paid out in the app.',
  },
  {
    q: 'Where do online payments go?',
    a: 'To the cooperative\u2019s own bank account, once an admin adds payout details in Settings. You can set this up after registration; until then, cash and transfer entries still work.',
  },
  {
    q: 'Can a member get a statement?',
    a: 'Yes. Open Passbook and download a PDF for the period you need. Officers can download cooperative-wide PDF statements and CSV ledgers from Statements.',
  },
];

export function getRole(id) {
  return ROLES.find((role) => role.id === id);
}

// Used by PageHeader to add a contextual "?" link on the pages people get stuck on.
export const PAGE_HELP = {
  adminHome: { href: '/help/admin#start', label: 'Using your dashboard' },
  adminMembers: { href: '/help/admin#members', label: 'Managing members' },
  adminPayments: { href: '/help/admin#payments', label: 'How payments post' },
  adminRecord: { href: '/help/admin#payments', label: 'Recording a payment' },
  adminCashbook: { href: '/help/bookkeeper#cashbook', label: 'Using the cashbook' },
  adminReconciliation: { href: '/help/admin#payments', label: 'About reconciliation' },
  adminLoans: { href: '/help/admin#loans', label: 'Handling loans' },
  adminPlans: { href: '/help/admin#plans', label: 'About savings plans' },
  adminStatements: { href: '/help/admin#statements', label: 'Downloading statements' },
  adminImport: { href: '/help/admin#members', label: 'Bringing members in' },
  adminSettings: { href: '/help/admin#setup', label: 'Setting up payouts' },
  adminTeam: { href: '/help/admin#team', label: 'Roles and permissions' },
  memberHome: { href: '/help/member#home', label: 'Your home page' },
  memberPay: { href: '/help/member#pay', label: 'How to pay' },
  memberPassbook: { href: '/help/member#passbook', label: 'About your passbook' },
  memberLoans: { href: '/help/member#loans', label: 'How loans work' },
  memberContributions: { href: '/help/member#plans', label: 'About savings plans' },
  memberGoals: { href: '/help/member#goals', label: 'About goals' },
  memberCard: { href: '/help/member#card', label: 'About your card' },
  memberNotifications: { href: '/help/member#notifications', label: 'About notifications' },
};
