import { Resend } from 'resend';
import { StoreOrder } from './types';
import { escapeHtml } from './siteHtml';

// Real transactional email for a new store order -- the in-app banner (lastOrderNotice)
// only reaches a seller with the app open; this reaches them even when it's closed, without
// needing to build real push-notification infrastructure (no APNs/device-token system
// exists anywhere in this app -- see ROADMAP.md Phase 9's same note for the billing banner).
//
// Sends from orders@buildsitespark.com, which needs that domain verified as a sending
// domain in the Resend dashboard (Domains -> Add Domain -> add the DNS records it shows at
// GoDaddy, same pattern as buildsitespark.com's own Hosting setup) before this will
// actually deliver -- until then, Resend will reject the send rather than silently drop it,
// so a failure here is visible in the Cloud Functions logs, not a mystery.
export async function sendOrderNotificationEmail(apiKey: string, sellerEmail: string, order: StoreOrder): Promise<void> {
  const resend = new Resend(apiKey);
  const itemsList = order.items
    .map((item) => `${item.quantity} × ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''} — $${(item.priceUsd * item.quantity).toFixed(2)}`)
    .join('<br>');

  // A booking's date/time/notes are shown prominently -- this is what makes it read as a
  // real, specific reservation to fulfill, not just an anonymous charge that arrived.
  const bookingBlock = order.bookingDetails
    ? `<div style="background:#EEF2FF;border-radius:8px;padding:12px;margin:12px 0;">
        <strong>Booking requested:</strong> ${order.bookingDetails.preferredDate} at ${order.bookingDetails.preferredTime}<br>
        ${order.bookingDetails.notes ? `<em>Notes: ${order.bookingDetails.notes}</em>` : ''}
      </div>`
    : '';

  await resend.emails.send({
    from: 'SiteSpark Orders <orders@buildsitespark.com>',
    to: sellerEmail,
    subject: order.bookingDetails
      ? `New booking request — $${order.sellerNetUsd.toFixed(2)} after fees`
      : `New order — $${order.sellerNetUsd.toFixed(2)} after fees`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;">
        <h2>${order.bookingDetails ? "You've got a new booking" : "You've got a new order"}</h2>
        <p>${itemsList}</p>
        ${bookingBlock}
        <p>
          Subtotal: $${order.subtotalUsd.toFixed(2)}<br>
          Platform fee: -$${order.platformFeeUsd.toFixed(2)}<br>
          <strong>Your payout: $${order.sellerNetUsd.toFixed(2)}</strong>
        </p>
        <p style="color:#64748B;font-size:13px;">
          ${order.bookingDetails ? 'Customer' : 'Buyer'}: ${order.buyerName ?? 'Unknown'} (${order.buyerEmail ?? 'no email provided'})<br>
          This was a single real payment via Stripe -- not a recurring charge.<br>
          View this ${order.bookingDetails ? 'booking' : 'order'} and your full payout history in the SiteSpark app.
        </p>
      </div>
    `,
  });
}

// Sent to the buyer (not the seller) the moment a seller marks an order shipped -- the only
// way a buyer finds out their order is moving, since there's no buyer account/notification
// system in this app, just whatever email they gave Stripe at checkout.
export async function sendShippingNotificationEmail(
  apiKey: string,
  buyerEmail: string,
  order: StoreOrder,
  sellerName: string
): Promise<void> {
  const resend = new Resend(apiKey);
  const itemsList = order.items.map((item) => `${item.quantity} × ${escapeHtml(item.name)}${item.variantLabel ? ` (${escapeHtml(item.variantLabel)})` : ''}`).join('<br>');
  const trackingBlock =
    order.trackingCarrier || order.trackingNumber
      ? `<p><strong>Carrier:</strong> ${order.trackingCarrier ? escapeHtml(order.trackingCarrier) : 'Not specified'}<br>
         <strong>Tracking number:</strong> ${order.trackingNumber ? escapeHtml(order.trackingNumber) : 'Not provided'}</p>`
      : '';

  await resend.emails.send({
    from: 'SiteSpark Orders <orders@buildsitespark.com>',
    to: buyerEmail,
    subject: `Your order from ${sellerName} has shipped`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;">
        <h2>Your order is on its way!</h2>
        <p>${itemsList}</p>
        ${trackingBlock}
        <p style="color:#64748B;font-size:13px;">Order #${order.id.slice(-8).toUpperCase()}</p>
      </div>
    `,
  });
}

export interface ContentReport {
  slug: string;
  reason: string;
  message: string;
  pageUrl: string;
}

// Apple App Store Review Guideline 1.2 (User-Generated Content) requires apps that let
// users publish public content to provide a way for anyone to report objectionable
// content -- this is that reporting path's real effect: a genuine email straight to the
// team, not just a form that silently writes to a database nobody looks at.
export async function sendContentReportEmail(apiKey: string, report: ContentReport): Promise<void> {
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: 'SiteSpark Reports <orders@buildsitespark.com>',
    to: 'support@buildsitespark.com',
    subject: `Content report: ${report.slug}`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;">
        <h2>A published site was reported</h2>
        <p><strong>Site:</strong> <a href="${escapeHtml(report.pageUrl)}">${escapeHtml(report.pageUrl)}</a></p>
        <p><strong>Reason:</strong> ${escapeHtml(report.reason)}</p>
        ${report.message ? `<p><strong>Details:</strong> ${escapeHtml(report.message)}</p>` : ''}
      </div>
    `,
  });
}
