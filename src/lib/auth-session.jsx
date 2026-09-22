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

   `setAuthTheme` is called with whichever studio is asking, since the
   auth panels carry their own palette and each studio has its own
   independent day/night state. A studio that never announces its theme
   would show the auth modal in the other mode's colours. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AuthModal, UserHeaderBar, getSession, saveSession, clearSession, setAuthTheme,
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
  const openAuth = useCallback(() => setShowAuthModal(true), []);
  const closeAuth = useCallback(() => setShowAuthModal(false), []);

  const value = useMemo(
    () => ({ user, setUser, showAuthModal, openAuth, closeAuth, handleAuth, handleSignOut, handleUpdate }),
    [user, showAuthModal, openAuth, closeAuth, handleAuth, handleSignOut, handleUpdate]);

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
      {showAuthModal && <AuthModal onClose={closeAuth} onAuth={handleAuth} />}
    </AuthSessionContext.Provider>
  );
}

/* Returns null when there is no provider above, so a studio rendered on
   its own in a test does not crash -- it simply shows no auth control. */
export function useAuthSession() {
  return useContext(AuthSessionContext);
}

/* The control a studio drops into its own header. It renders the bar and
   nothing else; the modal belongs to the provider. `dark` is the calling
   studio's own theme, announced so the auth panels match the mode the
   user is actually looking at. */
export function SharedAuthBar({ dark = true }) {
  const s = useAuthSession();
  useEffect(() => { setAuthTheme(!!dark); }, [dark]);
  if (!s) return null;
  return (
    <UserHeaderBar
      user={s.user}
      onSignOut={s.handleSignOut}
      onSignIn={s.openAuth}
      onUpdate={s.handleUpdate}
    />
  );
}
