// Left-hand brand panel shared by the sign-in and create-account screens.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="login" data-screen-label="Login">
      <div className="login-hero">
        <div className="brand"><span className="l1">Insight</span><span className="l2">Pitch</span></div>
        <div className="pitch">
          <h1>Better public decisions start as open proposals.</h1>
          <p>Citizens and officials draft proposals, publish them for public discussion, and keep every version on the record.</p>
        </div>
        <div className="copy">© 2026 Insight Pitch</div>
      </div>
      <div className="login-panel">{children}</div>
    </div>
  );
}
