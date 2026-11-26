"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSidebar } from "../components/SidebarProvider";
import styles from "./landing.module.css";

const workflow = [
  {
    title: "Enter a CNR",
    description: "Use the case’s 16-character reference number from eCourts.",
  },
  {
    title: "Follow the lookup",
    description: "See live progress as CaseFlow retrieves the court record.",
  },
  {
    title: "Read the summary",
    description: "Review the case history and ask follow-up questions in the same thread.",
  },
];

const iconPaths = {
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  down: <path d="M12 5v14m-6-6 6 6 6-6" />,
  court: <path d="m3 9 9-5 9 5H3Zm2 2v6m7-6v6m7-6v6M3 20h18" />,
  file: <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8m-8 4h5" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  spinner: <path d="M21 12a9 9 0 1 1-9-9" />,
};

function Icon({ name, size = 18, className }: {
  name: keyof typeof iconPaths;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  );
}

function CaseFilePreview() {
  return (
    <figure className={styles.preview}>
      <div className={styles.previewField}>
        <div className={styles.fileStack}>
          <div className={styles.folder} aria-hidden="true" />
          <div className={styles.recordSheet} aria-hidden="true" />

          <div className={styles.summarySheet}>
            <div className={styles.sheetHeader}>
              <span className={styles.sheetIcon}><Icon name="file" size={19} /></span>
              <div>
                <p className={styles.sheetSource}>CaseFlow</p>
                <p className={styles.sheetTitle}>Case summary</p>
              </div>
            </div>

            <div className={styles.sheetReference}>
              <span>CNR</span>
              <span>ABCD010012342024</span>
            </div>

            <p className={styles.timelineTitle}>Hearing history</p>
            <ol className={styles.timeline}>
              <li><span>08 Feb 2024</span>Case registered</li>
              <li><span>22 Mar 2024</span>First hearing</li>
              <li><span>17 Apr 2024</span>Order entered</li>
            </ol>
          </div>
        </div>
      </div>
      <figcaption className={styles.caption}>Example case summary</figcaption>
    </figure>
  );
}

export default function HomePage() {
  const [cnr, setCnr] = useState("");
  const [extractFir, setExtractFir] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();
  const { open: sidebarOpen, toggle: toggleSidebar } = useSidebar();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = cnr.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnr_num: trimmed, extract_fir: extractFir }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Couldn’t start the lookup. Try again.");
      }

      const chat = await response.json();
      router.push(`/chat/${chat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t start the lookup. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className={styles.landing}>
      <header className={styles.topbar}>
        <div className={styles.viewName}>
          <button
            type="button"
            className={styles.menuButton}
            onClick={toggleSidebar}
            aria-label="Case history"
            aria-expanded={sidebarOpen}
            aria-controls="case-sidebar"
          >
            <Icon name="menu" />
          </button>
          <Icon name="search" className={styles.viewIcon} size={17} />
          <span className={styles.desktopViewName}>Case lookup</span>
          <span className={styles.mobileBrand}>CaseFlow</span>
        </div>
        <a className={styles.guideLink} href="#how-it-works">
          How it works <Icon name="down" size={15} />
        </a>
      </header>

      <div className={styles.content}>
        <section className={styles.hero} aria-labelledby="lookup-title">
          <div className={styles.intro}>
            <p className={styles.source}><Icon name="court" size={17} /> Indian eCourts</p>
            <h1 id="lookup-title">Court records,<br className={styles.titleBreak} /> made readable.</h1>
            <p className={styles.description}>
              Look up an Indian court case and get an AI summary of its filings, hearings, and orders.
            </p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.cnrLabel} htmlFor="case-cnr">CNR number</label>
              <div className={styles.searchField}>
                <Icon name="search" size={20} className={styles.searchIcon} />
                <input
                  id="case-cnr"
                  type="text"
                  value={cnr}
                  onChange={(event) => {
                    setCnr(event.target.value.toUpperCase());
                    if (error) setError("");
                  }}
                  placeholder="ABCD010012342024"
                  disabled={loading}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="characters"
                  aria-describedby={helpOpen ? "cnr-help" : undefined}
                  suppressHydrationWarning
                />
                <button className={styles.submit} type="submit" disabled={!cnr.trim() || loading}>
                  {loading ? "Starting…" : "Look up case"}
                  <Icon
                    name={loading ? "spinner" : "arrow"}
                    size={17}
                    className={loading ? styles.spinner : styles.submitArrow}
                  />
                </button>
              </div>

              <div className={styles.formOptions}>
                <label className={styles.firOption}>
                  <input
                    type="checkbox"
                    checked={extractFir}
                    onChange={(event) => setExtractFir(event.target.checked)}
                    disabled={loading}
                  />
                  <span className={styles.switch} aria-hidden="true" />
                  Include FIR details
                </label>
                <button
                  className={styles.helpButton}
                  type="button"
                  aria-expanded={helpOpen}
                  aria-controls="cnr-help"
                  onClick={() => setHelpOpen((open) => !open)}
                >
                  What’s a CNR?
                </button>
              </div>

              <div id="cnr-help" className={styles.helpDisclosure} aria-hidden={!helpOpen}>
                <div>
                  <p>A CNR is the 16-character case reference number shown on eCourts and court documents. Enter it without spaces or hyphens.</p>
                </div>
              </div>
              <span className="sr-only" role="status">{loading ? "Starting case lookup" : ""}</span>
              {error && <p className={styles.error} role="alert">{error}</p>}
            </form>
          </div>

          <CaseFilePreview />
        </section>

        <section className={styles.workflow} id="how-it-works" aria-labelledby="workflow-title">
          <h2 id="workflow-title">From CNR to case summary</h2>
          <ol className={styles.steps}>
            {workflow.map((step, index) => (
              <li key={step.title}>
                <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
