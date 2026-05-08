import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dashboard } from "@/pages/Dashboard";
import { Environments } from "@/pages/Environments";
import { Assets } from "@/pages/Assets";
import { AssetDetail } from "@/pages/AssetDetail";
import { Findings } from "@/pages/Findings";
import { Policies } from "@/pages/Policies";
import { ScanHistory } from "@/pages/ScanHistory";
import { Logs } from "@/pages/Logs";
import { Settings } from "@/pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// NOTE: in dev this env var will be empty, in prod it will be automatically set
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL || undefined;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#22d3ee",
    colorForeground: "#f0f4f8",
    colorMutedForeground: "#94a3b8",
    colorDanger: "#ef4444",
    colorBackground: "#131f35",
    colorInput: "#1e2d45",
    colorInputForeground: "#f0f4f8",
    colorNeutral: "#2d3f58",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.375rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#131f35] border border-[#2d3f58] rounded-xl w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#f0f4f8] font-bold",
    headerSubtitle: "text-[#94a3b8]",
    socialButtonsBlockButtonText: "text-[#f0f4f8]",
    formFieldLabel: "text-[#94a3b8] text-sm",
    footerActionLink: "text-[#22d3ee] hover:text-[#67e8f9]",
    footerActionText: "text-[#94a3b8]",
    dividerText: "text-[#94a3b8]",
    identityPreviewEditButton: "text-[#22d3ee]",
    formFieldSuccessText: "text-[#22d3ee]",
    alertText: "text-[#f0f4f8]",
    logoBox: "flex justify-center",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border-[#2d3f58] bg-[#1e2d45] hover:bg-[#243450] text-[#f0f4f8]",
    formButtonPrimary: "bg-[#22d3ee] hover:bg-[#06b6d4] text-[#031014] font-semibold",
    formFieldInput: "bg-[#1e2d45] border-[#2d3f58] text-[#f0f4f8]",
    footerAction: "bg-[#0e1a2d]",
    dividerLine: "bg-[#2d3f58]",
    alert: "bg-[#1e2d45] border-[#2d3f58]",
    otpCodeFieldInput: "bg-[#1e2d45] border-[#2d3f58] text-[#f0f4f8]",
    formFieldRow: "",
    main: "",
  },
};

function SignInPage() {
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
        />
      </div>
    </div>
  );
}

function SignUpPage() {
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
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
        />
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ProtectedApp() {
  return (
    <Show when="signed-in">
      <AppLayout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/environments" component={Environments} />
          <Route path="/assets" component={Assets} />
          <Route path="/assets/:id" component={AssetDetail} />
          <Route path="/findings" component={Findings} />
          <Route path="/policies" component={Policies} />
          <Route path="/scan-history" component={ScanHistory} />
          <Route path="/logs" component={Logs} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </Show>
  );
}

function AppRouter() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to your CryptoGuard account",
          },
        },
        signUp: {
          start: {
            title: "Create an account",
            subtitle: "Get started with CryptoGuard",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route>
              {() => (
                <>
                  <Show when="signed-out">
                    <Redirect to="/sign-in" />
                  </Show>
                  <ProtectedApp />
                </>
              )}
            </Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <WouterRouter base={basePath}>
      <AppRouter />
    </WouterRouter>
  );
}

export default App;
