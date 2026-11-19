/* =====================================================================
   ONE SIGNED-IN SESSION, SHARED BY ALL THREE STUDIOS
   =====================================================================
   Sign-in lived entirely inside App.jsx, which is only the eVTOL mode.
   The aircraft and drone studios were added later as separate modes with
   their own headers and inherited none of it: zero references to
   UserHeaderBar, AuthModal or getSession between them. So an account
   existed in one third of the tool, and the other two thirds could not
   see that anyone was signed in.

   WHY A CONTEXT RATHER THAN THREE COPIES. Root.jsx keeps all three
   studios MOUNTED at once so switching modes preserves each design, so
   three independent `useState(getSession())` calls would be three live
   copies of one fact. Signing out in one mode would leave the other two
   still showing a signed-in header until something forced them to
   re-read localStorage. The session is one thing, so it is held once,
   above all three, and each studio reads it.

   The provider owns the modal too. It is rendered ONCE here rather than
   per studio, because two mounted studios would otherwise each render
   their own copy and the second would sit invisibly behind the first.

   The auth panels read the one shared palette (lib/display.js writes it),
   so there is no theme to announce: each studio used to call setAuthTheme
   with its own day/night state, and the last one to do so won. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AuthModal, UserHeaderBar, getSession, saveSession, clearSession,
} from "../AuthSystem";

const AuthSessionContext = createContext(null);

export function AuthSessionProvider({ children }) {
  const [user, setUser] = useState(() => getSession());
  const [showAuthModal, setShowAuthModal] = useState(false);

  /* Another tab signing in or out is the same session changing, so it is
     honoured rather than ignored: `storage` fires only in OTHER tabs. */
  useEffect(() => {
    const onStorage = () => setUser(getSession());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /* saveSession FIRST, then state: App.jsx's original handler persisted
     before updating, and dropping that would sign the user out again on
     the next reload while the header still said they were signed in. */
  const handleAuth = useCallback((session) => {
    saveSession(session); setUser(session); setShowAuthModal(false);
  }, []);
  const handleSignOut = useCallback(() => { clearSession(); setUser(null); }, []);
  const handleUpdate = useCallback((session) => { saveSession(session); setUser(session); }, []);
  /* `flow` opens the dialog on registration rather than sign-in; anything
     else (a click event, nothing) opens sign-in, as before. */
  const [authFlow, setAuthFlow] = useState("login");
  const openAuth = useCallback((flow) => { setAuthFlow(flow === "register" ? "register" : "login"); setShowAuthModal(true); }, []);
  const closeAuth = useCallback(() => setShowAuthModal(false), []);

  const value = useMemo(
    () => ({ user, setUser, showAuthModal, openAuth, closeAuth, handleAuth, handleSignOut, handleUpdate }),
    [user, showAuthModal, openAuth, closeAuth, handleAuth, handleSignOut, handleUpdate]);

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
      {showAuthModal && <AuthModal key={authFlow} defaultFlow={authFlow} onClose={closeAuth} onAuth={handleAuth} />}
    </AuthSessionContext.Provider>
  );
}

/* Returns null when there is no provider above, so a studio rendered on
   its own in a test does not crash -- it simply shows no auth control. */
export function useAuthSession() {
  return useContext(AuthSessionContext);
}

/* The control a studio drops into its own header. It renders the bar and
   nothing else; the modal belongs to the provider. */
export function SharedAuthBar() {
  const s = useAuthSession();
  if (!s) return null;
  return (
    <UserHeaderBar
      user={s.user}
      onSignOut={s.handleSignOut}
      onSignIn={() => s.openAuth("login")}
      onRegister={() => s.openAuth("register")}
      onUpdate={s.handleUpdate}
    />
  );
}
