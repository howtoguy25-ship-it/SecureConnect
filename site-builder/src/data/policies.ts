// Real policy content reflecting what this app actually does with data and payments --
// not boilerplate. Written to be accurate as of the features actually built (see
// ROADMAP.md for what's live vs. planned). This should still get a real legal review
// before App Store submission -- accurate-but-unreviewed is not the same as compliant,
// especially for GDPR/CCPA-style regional obligations this doesn't attempt to cover.

export interface PolicySection {
  heading: string;
  body: string;
}

export const PRIVACY_POLICY_UPDATED = 'Last updated: 18 July 2026';

export const PRIVACY_POLICY: PolicySection[] = [
  {
    heading: 'What we collect',
    body:
      'Account info: your email, phone number, or Google/Apple account details, handled by Firebase Authentication. ' +
      'Content you create: text, images, video/audio clips, and site layouts you add to your projects. ' +
      'AI prompts: what you type into the AI Site Builder or the Spark assistant. ' +
      'Payment-adjacent info: for domain purchases/transfers, the real registrant contact (name, address, phone, ' +
      'email) required by ICANN for domain registration. We never see or store your card details directly.',
  },
  {
    heading: 'Who we share it with, and why',
    body:
      'Firebase/Google Cloud hosts your account, projects, and files, and runs the backend that powers this app. ' +
      'OpenAI processes AI Site Builder prompts and the Spark assistant’s conversation to generate copy, layouts, ' +
      'and images — per OpenAI’s API terms, this data is not used to train their models. ' +
      'Stripe processes real payments for domain purchases; we receive confirmation of payment, never your full ' +
      'card number. Namecheap is our domain registrar partner — for any domain you buy, register, or transfer ' +
      'through the app, your registrant contact is submitted to them to complete the real ICANN registration; ' +
      'free WHOIS privacy protection is requested automatically so it isn’t publicly visible in WHOIS lookups. ' +
      'Apple processes subscription and credit-pack purchases through In-App Purchase once that’s live.',
  },
  {
    heading: 'Publishing makes content public',
    body:
      'When you publish a project, its content (text, images, video) becomes a real, publicly reachable web page ' +
      'that anyone with the link — or your connected domain — can view. Unpublishing takes it back down. ' +
      'Don’t publish anything you don’t want visible to the public.',
  },
  {
    heading: 'Your choices',
    body:
      'You can delete individual projects at any time from the Projects screen. To delete your account entirely, ' +
      'go to Account → Delete Account — this immediately and permanently removes your projects, published sites, ' +
      'credit balance, order history, and assistant chat history from our systems; no need to contact support. ' +
      'Domain registrations already submitted to Namecheap follow that registrar’s own account/data rules, since ' +
      'the domain itself is a real-world asset independent of this app.',
  },
  {
    heading: 'Contact',
    body: 'Questions about this policy or your data: support@buildsitespark.com or +61 408 680 813.',
  },
];

export const RETURN_POLICY_UPDATED = 'Last updated: 18 July 2026';

export const RETURN_POLICY: PolicySection[] = [
  {
    heading: 'Subscriptions and credit packs',
    body:
      'Plans (Beginner/Middle Class/Advanced) and credit packs are purchased through Apple’s In-App Purchase. ' +
      'Apple processes all payments for these and handles refund requests directly — SiteSpark does not have ' +
      'the ability to issue refunds for IAP purchases itself. Request a refund at reportaproblem.apple.com or ' +
      'through your Apple ID purchase history.',
  },
  {
    heading: 'Theme unlocks',
    body:
      'Luxury theme unlocks ($189) and luxury-crazy theme unlocks ($399) are one-time Apple In-App Purchases, ' +
      'subject to the same Apple-handled refund process as above.',
  },
  {
    heading: 'Domain purchases and transfers',
    body:
      'Buying or transferring a real domain is processed as a one-time Stripe payment, separate from Apple IAP, ' +
      'because a registered domain is a real-world asset rather than digital app content. If a domain registration ' +
      'or transfer fails on our end (for example, the registrar rejects it), you are not charged — payment is ' +
      'only captured, and the domain only registered, once both succeed. Once a domain is successfully registered ' +
      'or an inbound transfer completes, it generally cannot be refunded, in line with standard domain industry and ' +
      'ICANN practice — the underlying registration cost has already been paid to the registry. If something ' +
      'goes wrong on your purchase, contact support below and we’ll look into it.',
  },
  {
    heading: 'Contact',
    body: 'Billing or refund questions: support@buildsitespark.com or +61 408 680 813.',
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'How do free credits work?',
    answer: 'Every new account gets 30 free credits to try the AI Site Builder. Building a site costs credits based on how detailed you ask it to be — see the Subscription screen for exact pricing.',
  },
  {
    question: 'Can I edit an AI-generated site afterward?',
    answer: 'Yes — once the AI Site Builder finishes, it opens straight into the regular canvas editor, where you can move, resize, or replace anything it created.',
  },
  {
    question: 'What happens if I unpublish a project?',
    answer: 'Its public page stops being reachable immediately. Your project itself isn’t deleted — you can republish any time.',
  },
  {
    question: 'Do I need to own a domain to publish?',
    answer: 'No — every published project gets a real, working link automatically. Connecting or buying a custom domain is optional.',
  },
  {
    question: 'Is my card information stored by SiteSpark?',
    answer: 'No. Domain purchases are processed by Stripe, and subscriptions/credit packs by Apple’s In-App Purchase — SiteSpark never sees or stores your full card details.',
  },
];
