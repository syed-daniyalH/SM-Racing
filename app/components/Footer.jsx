"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import GitHubIcon from "@mui/icons-material/GitHub";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import TwitterIcon from "@mui/icons-material/Twitter";
import "./Footer.css";

const buildMailto = (address, subject) =>
  `mailto:${address}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;

const isExternalHref = (href) => /^https?:\/\//i.test(href);

function FooterLink({ item }) {
  const content = (
    <>
      <span className="footer-link-dot" aria-hidden="true" />
      <span className="footer-link-text">{item.label}</span>
      <ArrowForwardRoundedIcon className="footer-link-arrow" fontSize="inherit" />
    </>
  );

  if (item.external || isExternalHref(item.href) || item.href.startsWith("mailto:")) {
    return (
      <a
        className="footer-link"
        href={item.href}
        target={isExternalHref(item.href) ? "_blank" : undefined}
        rel={isExternalHref(item.href) ? "noreferrer noopener" : undefined}
      >
        {content}
      </a>
    );
  }

  return (
    <Link className="footer-link" href={item.href}>
      {content}
    </Link>
  );
}

function FooterLinkColumn({ title, items, compact = false }) {
  return (
    <section className={`footer-column ${compact ? "footer-column-compact" : ""}`}>
      <h4 className="footer-column-title">{title}</h4>
      <ul className="footer-link-list">
        {items.map((item) => (
          <li key={item.label} className="footer-link-item">
            <FooterLink item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SocialLink({ href, label, icon: Icon }) {
  const isHttpLink = isExternalHref(href);

  return (
    <a
      className="footer-social-link"
      href={href}
      aria-label={label}
      title={label}
      target={isHttpLink ? "_blank" : undefined}
      rel={isHttpLink ? "noreferrer noopener" : undefined}
    >
      {Icon ? <Icon fontSize="inherit" /> : null}
    </a>
  );
}

export default function Footer() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  const isAuthPage =
    pathname === "/login" || pathname === "/admin/login" || pathname === "/signup";
  const isAdminPortal = pathname.startsWith("/admin");
  const isSubmissionReportPage = pathname.startsWith("/admin/submissions/report/");

  if (isAuthPage || isAdminPortal || isSubmissionReportPage) {
    return null;
  }

  const adminMode = Boolean(isAdmin?.());

  const productLinks = adminMode
    ? [
        { label: "User Management", href: "/admin/users" },
        { label: "Driver Management", href: "/admin/drivers" },
        { label: "Vehicle Management", href: "/admin/vehicles" },
        { label: "Track Management", href: "/admin/tracks" },
        { label: "Event Management", href: "/admin/events" },
        { label: "Submission Review", href: "/admin/submissions" },
      ]
    : [
        { label: "Events", href: "/events" },
        { label: "Support", href: buildMailto("support@sm2racing.local", "SM-2 Support") },
        { label: "System Status", href: buildMailto("support@sm2racing.local", "SM-2 System Status") },
      ];

  const resourceLinks = [
    { label: "API Reference", href: buildMailto("support@sm2racing.local", "SM-2 API Reference") },
    { label: "Release Notes", href: buildMailto("support@sm2racing.local", "SM-2 Release Notes") },
    { label: "Documentation", href: buildMailto("support@sm2racing.local", "SM-2 Documentation") },
    { label: "Support Center", href: buildMailto("support@sm2racing.local", "SM-2 Support") },
  ];

  const companyLinks = [
    { label: "About", href: buildMailto("info@sm2racing.local", "About SM-2") },
    { label: "Contact", href: buildMailto("support@sm2racing.local", "Contact SM-2") },
    { label: "Careers", href: buildMailto("careers@sm2racing.local", "Careers at SM-2") },
    { label: "Press", href: buildMailto("press@sm2racing.local", "SM-2 Press") },
  ];

  const legalLinks = [
    { label: "Privacy Policy", href: buildMailto("privacy@sm2racing.local", "SM-2 Privacy Policy") },
    { label: "Terms of Service", href: buildMailto("legal@sm2racing.local", "SM-2 Terms of Service") },
    { label: "Security", href: buildMailto("security@sm2racing.local", "SM-2 Security") },
    { label: "Compliance", href: buildMailto("compliance@sm2racing.local", "SM-2 Compliance") },
  ];

  const currentYear = new Date().getFullYear();
  const showPortalLinkColumns = adminMode;

  return (
    <footer className="footer footer-modern">
      <div className="footer-orb footer-orb-one" aria-hidden="true" />
      <div className="footer-orb footer-orb-two" aria-hidden="true" />
      <div className="footer-orb footer-orb-three" aria-hidden="true" />

      <div className="footer-divider footer-divider-top" aria-hidden="true" />

      <div className="footer-container">
        <div className={`footer-main-grid ${showPortalLinkColumns ? "" : "footer-main-grid-compact"}`}>
          <section className="footer-brand-panel">
            <div className="footer-brand-row">
              <div className="footer-brand-mark" aria-hidden="true">
                SM-2
              </div>
              <div className="footer-brand-copy">
                <h3 className="footer-brand-name">SM-2</h3>
                <p className="footer-brand-tagline">Race Control</p>
              </div>
            </div>

            <p className="footer-description">
              Professional motorsport operations for race control, event management,
              structured submissions, and audit-ready admin workflows.
            </p>

            <div className="footer-social-row" aria-label="Social links">
              <SocialLink
                href={buildMailto("support@sm2racing.local", "SM-2 Support")}
                label="Email"
                icon={EmailOutlinedIcon}
              />
              <SocialLink
                href="https://www.linkedin.com/"
                label="LinkedIn"
                icon={LinkedInIcon}
              />
              <SocialLink
                href="https://x.com/"
                label="Twitter"
                icon={TwitterIcon}
              />
              <SocialLink
                href="https://github.com/"
                label="GitHub"
                icon={GitHubIcon}
              />
            </div>
          </section>

          {showPortalLinkColumns ? (
            <>
              <FooterLinkColumn title="Product" items={productLinks} />
              <FooterLinkColumn title="Resources" items={resourceLinks} />
              <FooterLinkColumn title="Company" items={companyLinks} />
              <FooterLinkColumn title="Legal" items={legalLinks} />
            </>
          ) : null}
        </div>

        <div className="footer-divider footer-divider-middle" aria-hidden="true" />

        <div className="footer-bottom">
          <div className="footer-bottom-copy">
            <p className="footer-copyright">
              Copyright {currentYear} SM-2 Race Control.
            </p>
            <p className="footer-meta-copy">
              Built for race-weekend operations, clean reference data, and traceable
              submission workflows.
            </p>
          </div>

          <div className="footer-status-card">
            <div className="footer-status-line">
              <span className="footer-status-dot" aria-hidden="true" />
              <span className="footer-status-label">System Online</span>
            </div>
            <div className="footer-status-meta">
              <span className="footer-version">SM-2 v1.0.0</span>
              <span className="footer-latest-badge">Latest</span>
            </div>
          </div>
        </div>
      </div>

      <div className="footer-divider footer-divider-bottom" aria-hidden="true" />
    </footer>
  );
}
