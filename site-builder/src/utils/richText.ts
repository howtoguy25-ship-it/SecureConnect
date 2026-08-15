import { PolicyKind, RichTextRun } from '@/types';

export function plainParagraph(text: string): RichTextRun[] {
  return [{ text }];
}

export function boldParagraph(text: string): RichTextRun[] {
  return [{ text, bold: true }];
}

export function richTextIsEmpty(paragraphs: RichTextRun[][]): boolean {
  return paragraphs.every((p) => p.every((run) => !run.text.trim()));
}

export const POLICY_KIND_LABELS: Record<PolicyKind, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  shipping: 'Shipping Policy',
  refund: 'Refund/Return Policy',
  contact: 'Contact Information',
  custom: 'Custom Page',
};

const todayLong = () =>
  new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// A real, standard-wording template per policy kind, filled in with the site's own name --
// free and instant (no AI credit spent), since these are legal-adjacent pages where safe,
// standard boilerplate beats an AI paraphrase. Users can edit every word afterward in the
// rich text editor -- this is a starting point, not a locked template.
export function templateForPolicy(kind: PolicyKind, siteName: string): RichTextRun[][] {
  const name = siteName.trim() || 'this site';
  const updated = `Last updated: ${todayLong()}`;

  switch (kind) {
    case 'privacy':
      return [
        boldParagraph(updated),
        plainParagraph(
          `${name} collects only the information needed to operate this website and fulfill any orders placed here -- things like your name, email address, shipping address, and payment details (processed securely by our payment provider; we never store your card number ourselves).`
        ),
        plainParagraph(
          `We use this information to process orders, respond to inquiries, and improve this site. We do not sell your personal information to third parties.`
        ),
        plainParagraph(
          `You may request a copy of the information we hold about you, or ask us to delete it, at any time by reaching out through our Contact Information page.`
        ),
      ];
    case 'terms':
      return [
        boldParagraph(updated),
        plainParagraph(
          `By using ${name}, you agree to use this site only for its intended, lawful purpose. All content on this site -- text, images, and branding -- belongs to ${name} unless otherwise noted.`
        ),
        plainParagraph(
          `${name} reserves the right to update these terms, refuse service, or change site content at any time without prior notice.`
        ),
        plainParagraph(`Questions about these terms can be sent to us through our Contact Information page.`),
      ];
    case 'shipping':
      return [
        boldParagraph(updated),
        plainParagraph(
          `Orders from ${name} are typically prepared within 1-3 business days of purchase. Delivery times vary based on your location and shipping method selected at checkout.`
        ),
        plainParagraph(
          `You will receive a confirmation once your order ships. If your order hasn't arrived within the expected window, contact us through our Contact Information page and we'll help track it down.`
        ),
      ];
    case 'refund':
      return [
        boldParagraph(updated),
        plainParagraph(
          `If you're not satisfied with your purchase from ${name}, reach out to us within 14 days of receiving your order through our Contact Information page.`
        ),
        plainParagraph(
          `Items must be in their original condition to be eligible for a refund or exchange. Digital products and booked services are non-refundable once delivered/rendered, unless otherwise stated at checkout.`
        ),
        plainParagraph(`Approved refunds are returned to your original payment method within 5-10 business days.`),
      ];
    case 'contact':
      return [
        plainParagraph(`Reach ${name} through any of the details below:`),
        plainParagraph('Email: your@email.com'),
        plainParagraph('Phone: (000) 000-0000'),
        plainParagraph('Address: Your business address'),
      ];
    case 'custom':
    default:
      return [plainParagraph('')];
  }
}
