import { SignIn } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 mb-4">
            <svg viewBox="0 0 48 48" className="w-7 h-7" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M24 8L12 14v10c0 7.18 5.14 13.9 12 15.5C30.86 37.9 36 31.18 36 24V14L24 8z" stroke="#22d3ee" strokeWidth="2.5" strokeLinejoin="round"/>
              <path d="M19 24l3.5 3.5L29 20" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">CryptoGuard</h1>
          <p className="text-sm text-muted-foreground mt-1">Enterprise Cryptographic Asset Management</p>
        </div>
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          forceRedirectUrl={`${basePath}/`}
        />
      </div>
    </div>
  );
}
