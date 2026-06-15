import type { Metadata } from "next";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/lib/auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mini Cursor — AI Coding Agent",
  description: "AI-native software engineering platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ErrorBoundary>
          <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""}>
            <AuthProvider>
              {children}
              <Toaster
                position="bottom-right"
                toastOptions={{
                  style: { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", fontSize: "13px" },
                }}
              />
            </AuthProvider>
          </GoogleOAuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
