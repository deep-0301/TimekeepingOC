"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fmtDate, dayLabel, parseDateStr } from "@/lib/dateUtils";
import {
  ExchangeNotSetUpError,
  acceptClaim,
  contactFor,
  createPost,
  declineClaim,
  isApproved,
  kindLabel,
  listMyClaims,
  listPosts,
  offerOn,
  settlePost,
  withdrawClaim,
  withdrawPost,
  type ExchangeClaim,
  type ExchangeContact,
  type ExchangePost,
  type PostKind,
} from "@/lib/exchange";
import PanelHeading from "@/components/PanelHeading";
import { ChevronRight, ExpandMore } from "@/components/icons";

/**
 * Work exchange - a board of shifts operators want covered or want to pick up.
 *
 * It arranges the conversation; it does not arrange the trade. OC Transpo and
 * ATU 279 have their own process for that, and an operator who posts here and
 * then does not file it has not swapped anything. The screen says so where it
 * cannot be missed rather than in help text nobody opens.
 */

function ContactCard({ claimId }: { claimId: string }) {
  const [contact, setContact] = useState<ExchangeContact | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const c = await contactFor(claimId);
        if (!live) return;
        setContact(c);
        setState(c ? "ready" : "none");
      } catch {
        if (live) setState("none");
      }
    })();
    return () => {
      live = false;
    };
  }, [claimId]);

  if (state === "loading") return <div className="note">Loading contact…</div>;
  if (state === "none" || !contact) {
    return <div className="note">Contact details are not available.</div>;
  }

  const href =
    contact.contactKind === "email"
      ? `mailto:${contact.contact}`
      : contact.contactKind === "phone" || contact.contactKind === "text"
        ? `${contact.contactKind === "text" ? "sms" : "tel"}:${contact.contact}`
        : null;

  return (
    <div className="xc-contact">
      <div className="xc-contact-head">
        <b>{contact.fullName || "Operator"}</b>
        {contact.operatorNumber && (
          <span className="shift-tag">#{contact.operatorNumber}</span>
        )}
      </div>
      {contact.contact ? (
        <div className="xc-contact-line">
          {href ? (
            <a href={href}>{contact.contact}</a>
          ) : (
            <span>{contact.contact}</span>
          )}
          {contact.contactKind && (
            <span className="xc-contact-kind">
              {contact.contactKind === "text"
                ? "text only"
                : contact.contactKind}
            </span>
          )}
        </div>
      ) : (
        <div className="note">
          They have not set a contact method yet. Ask them to add one under
          Profile.
        </div>
      )}
    </div>
  );
}

function PostCard({
  post,
  mine,
  claims,
  onChanged,
}: {
  post: ExchangePost;
  mine: boolean;
  claims: ExchangeClaim[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const own = claims.find((c) => c.postId === post.id && !mine);
  const onPost = claims.filter((c) => c.postId === post.id);
  const accepted = onPost.find((c) => c.status === "accepted");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={"xc-post" + (post.status !== "open" ? " is-settled" : "")}>
      <div className="xc-post-head">
        <span className={"xc-kind xc-kind-" + post.kind}>
          {kindLabel(post.kind)}
        </span>
        <b className="xc-date">{dayLabel(parseDateStr(post.workDate))}</b>
        {post.paddle && <span className="shift-tag">{post.paddle}</span>}
        {post.status !== "open" && (
          <span className="badge estimate">
            {post.status === "claimed" ? "taken" : post.status}
          </span>
        )}
      </div>

      <div className="xc-post-body">
        {(post.onTime || post.offTime) && (
          <span className="xc-times">
            {post.onTime || "?"} &rarr; {post.offTime || "?"}
          </span>
        )}
        {post.garage && <span className="xc-garage">{post.garage}</span>}
        <span className="xc-owner">
          {mine ? "you" : post.ownerName || "an operator"}
          {!mine && post.ownerNumber ? ` · #${post.ownerNumber}` : ""}
        </span>
      </div>

      {post.note && <div className="xc-note">{post.note}</div>}

      <div className="xc-post-actions">
        {mine ? (
          <>
            <span className="note" style={{ margin: 0 }}>
              {post.claimCount === 0
                ? "No offers yet"
                : post.claimCount === 1
                  ? "1 offer"
                  : `${post.claimCount} offers`}
            </span>
            {onPost.length > 0 && (
              <button
                className="ghost small"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
              >
                {open ? <ExpandMore /> : <ChevronRight />}
                {accepted ? "Who took it" : "See offers"}
              </button>
            )}
            {post.status === "open" && (
              <button
                className="ghost small"
                disabled={busy}
                onClick={() => void run(() => withdrawPost(post.id))}
              >
                Withdraw
              </button>
            )}
            {post.status === "claimed" && (
              <button
                className="ghost small"
                disabled={busy}
                onClick={() => void run(() => settlePost(post.id))}
              >
                Mark filed with the employer
              </button>
            )}
          </>
        ) : own ? (
          <>
            <span className="note" style={{ margin: 0 }}>
              {own.status === "accepted"
                ? "They accepted your offer"
                : own.status === "declined"
                  ? "They went with someone else"
                  : "You have offered"}
            </span>
            {own.status === "accepted" && (
              <button
                className="ghost small"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
              >
                {open ? <ExpandMore /> : <ChevronRight />}
                Contact them
              </button>
            )}
            {own.status === "offered" && (
              <button
                className="ghost small"
                disabled={busy}
                onClick={() => void run(() => withdrawClaim(own.id))}
              >
                Take my offer back
              </button>
            )}
          </>
        ) : post.status === "open" ? (
          <>
            <input
              type="text"
              className="xc-offer-note"
              placeholder="Add a note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              className="small"
              disabled={busy}
              onClick={() => void run(() => offerOn(post.id, note))}
            >
              Offer to take it
            </button>
          </>
        ) : (
          <span className="note" style={{ margin: 0 }}>
            Already taken
          </span>
        )}
      </div>

      {error && <div className="note xc-error">{error}</div>}

      {open && mine && (
        <div className="xc-offers">
          {onPost.map((c) => (
            <div key={c.id} className="xc-offer">
              <div className="xc-offer-head">
                <b>{c.claimantName || "An operator"}</b>
                {c.claimantNumber && (
                  <span className="shift-tag">#{c.claimantNumber}</span>
                )}
                {c.status !== "offered" && (
                  <span className="badge estimate">{c.status}</span>
                )}
              </div>
              {c.note && <div className="xc-note">{c.note}</div>}
              {c.status === "offered" && !accepted && (
                <div className="xc-post-actions">
                  <button
                    className="small"
                    disabled={busy}
                    onClick={() => void run(() => acceptClaim(c.id, post.id))}
                  >
                    Accept
                  </button>
                  <button
                    className="ghost small"
                    disabled={busy}
                    onClick={() => void run(() => declineClaim(c.id))}
                  >
                    Decline
                  </button>
                </div>
              )}
              {c.status === "accepted" && <ContactCard claimId={c.id} />}
            </div>
          ))}
        </div>
      )}

      {open && !mine && own?.status === "accepted" && (
        <ContactCard claimId={own.id} />
      )}
    </div>
  );
}

function NewPostForm({ onPosted }: { onPosted: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PostKind>("give_away");
  const [workDate, setWorkDate] = useState(fmtDate(new Date()));
  const [paddle, setPaddle] = useState("");
  const [onTime, setOnTime] = useState("");
  const [offTime, setOffTime] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button className="manage-work-toggle" onClick={() => setOpen(true)}>
        <ChevronRight /> Post work
      </button>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await createPost({ kind, workDate, paddle, onTime, offTime, note });
      setPaddle("");
      setOnTime("");
      setOffTime("");
      setNote("");
      setOpen(false);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="xc-form">
      <div className="day-editor-extras">
        <div className="field">
          <label htmlFor="xc-kind">What is this?</label>
          <select
            id="xc-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as PostKind)}
          >
            <option value="give_away">I want someone to take this work</option>
            <option value="want">I am looking for work that day</option>
            <option value="swap">I want to swap it for something</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="xc-date">Date</label>
          <input
            id="xc-date"
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="xc-paddle">Paddle</label>
          <input
            id="xc-paddle"
            type="text"
            placeholder="68-01"
            value={paddle}
            onChange={(e) => setPaddle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="xc-on">On</label>
          <input
            id="xc-on"
            type="text"
            placeholder="17:28"
            value={onTime}
            onChange={(e) => setOnTime(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="xc-off">Off</label>
          <input
            id="xc-off"
            type="text"
            placeholder="01:22"
            value={offTime}
            onChange={(e) => setOffTime(e.target.value)}
          />
        </div>
      </div>
      <input
        type="text"
        placeholder="Anything else worth saying"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="xc-post-actions">
        <button className="small" disabled={busy} onClick={() => void submit()}>
          {busy ? "Posting…" : "Post it"}
        </button>
        <button className="ghost small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <div className="note xc-error">{error}</div>}
    </div>
  );
}

export default function ExchangePage() {
  const [posts, setPosts] = useState<ExchangePost[]>([]);
  const [claims, setClaims] = useState<ExchangeClaim[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "not-approved" | "not-set-up" | "error"
  >("loading");
  const [error, setError] = useState("");

  // Bumped whenever something on the board changes, which re-runs the load
  // below. Keeping the fetch inside the effect rather than in a callback the
  // effect calls is what keeps every setState behind an await.
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!live) return;
        const uid = session.session?.user.id ?? null;

        const approved = await isApproved();
        if (!live) return;
        if (!approved) {
          setMe(uid);
          setState("not-approved");
          return;
        }

        const [p, c] = await Promise.all([
          listPosts(fmtDate(new Date())),
          listMyClaims(),
        ]);
        if (!live) return;
        setMe(uid);
        setPosts(p);
        setClaims(c);
        setState("ready");
      } catch (err) {
        if (!live) return;
        if (err instanceof ExchangeNotSetUpError) {
          setState("not-set-up");
          setError(err.message);
          return;
        }
        setState("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      live = false;
    };
  }, [tick]);

  return (
    <>
      <section className="panel">
        <PanelHeading
          title="Work Exchange"
          info={
            <>
              A board for work you need covered and work you would like to
              pick up. Contact details are never on the board — when someone
              accepts your offer, the two of you can see each other&rsquo;s and
              nobody else can. Set how you want to be reached under Profile.
            </>
          }
        />

        <div className="xc-warning">
          <b>This board arranges the conversation, not the trade.</b>{" "}
          Posting here and having someone accept does not swap anything with
          OC Transpo. The exchange still has to go through the employer&rsquo;s own
          process, by both of you, before either of you stops showing up.
        </div>

        {state === "loading" && <div className="note">Loading the board…</div>}

        {state === "not-set-up" && (
          <div className="note">
            {error} Until then nobody can post or see anything here.
          </div>
        )}

        {state === "not-approved" && (
          <div className="note">
            Your account is not on the exchange yet. The board shows real
            operators&rsquo; work and releases contact details, so access is
            given rather than taken — ask whoever runs this app to approve your
            operator number.
          </div>
        )}

        {state === "error" && <div className="note xc-error">{error}</div>}

        {state === "ready" && (
          <>
            <NewPostForm onPosted={reload} />
            {posts.length === 0 ? (
              <div className="note">
                Nothing on the board. Post work you need covered, or say which
                day you are free.
              </div>
            ) : (
              <div className="xc-list">
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    mine={p.owner === me}
                    claims={claims.filter((c) => c.postId === p.id)}
                    onChanged={reload}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
