/**
 * Static fallback content for Terms of Service, Privacy Policy, and About Us.
 * Used when API getFooterLinkByPath returns no content (e.g. on Settings and Login).
 * Path mapping: 9 = About Us, 10 = Privacy Policy, 11 = Terms of Service.
 */
export const STATIC_FOOTER_CONTENT = {
  9: `About Us

Welcome to our app. We are committed to bringing you the best short-form video and series experience.

Our Mission
We aim to entertain and engage you with fast stories and real feels—content you can enjoy in under a minute.

What We Offer
• Short-form video content and series
• Personalized recommendations
• Watch history and continue watching
• My List and bookmarks

Contact Us
If you have any questions or feedback, please reach out through the app settings or our support channels.

Thank you for using our service.`,

  10: `Privacy Policy

Last updated: Please refer to the in-app version for the latest date.

Your privacy matters to us. This policy describes how we collect, use, and protect your information when you use our app.

Information We Collect
• Account information (name, email, phone when you sign up)
• Usage data (what you watch, preferences)
• Device information (type, OS) for a better experience

How We Use Your Information
• To provide and improve our service
• To personalize content and recommendations
• To communicate with you about the service
• To ensure security and prevent abuse

Data Sharing
We do not sell your personal information. We may share data with service providers who help us run the app, under strict agreements.

Your Choices
You can manage your account and preferences in Settings. You may request access to or deletion of your data by contacting us.

Security
We use industry-standard measures to protect your data.

Changes
We may update this policy from time to time. Continued use of the app after changes means you accept the updated policy.

Contact
For privacy-related questions, contact us through the app or the contact details provided in the app.`,

  11: `Terms of Service

Last updated: Please refer to the in-app version for the latest date.

By using our app, you agree to these Terms of Service.

Use of Service
• You must be at least 13 years old (or the minimum age in your country) to use the service.
• You are responsible for keeping your account secure and for all activity under your account.
• You may not misuse the service, copy content without permission, or use the app for illegal purposes.

Content
• Content on the app is for personal, non-commercial use.
• We may change or remove content without notice.
• Some content may be subject to regional availability.

Account and Subscription
• You may need to create an account. You agree to provide accurate information.
• Paid subscriptions are subject to the terms shown at the time of purchase and our payment provider’s terms.

Termination
We may suspend or terminate your access if you breach these terms or for other operational reasons.

Disclaimer
The service is provided “as is.” We do not guarantee uninterrupted or error-free service.

Limitation of Liability
To the extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from your use of the app.

Changes to Terms
We may update these terms. We will notify you of material changes. Continued use after changes constitutes acceptance.

Contact
For questions about these terms, contact us through the app or the contact details provided.`,
};

/**
 * Returns static fallback content for a footer link path when API returns no content.
 * @param {number} path - Footer link path (9 = About Us, 10 = Privacy, 11 = Terms)
 * @returns {string} Static content or empty string if no mapping
 */
export function getStaticFooterContent(path) {
  const key = path != null ? Number(path) : NaN;
  return STATIC_FOOTER_CONTENT[key] || '';
}
