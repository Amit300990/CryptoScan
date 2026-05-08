import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Dashboard } from "@/pages/Dashboard";
import { Environments } from "@/pages/Environments";
import { Assets } from "@/pages/Assets";
import { AssetDetail } from "@/pages/AssetDetail";
import { Findings } from "@/pages/Findings";
import { Policies } from "@/pages/Policies";
import { ScanHistory } from "@/pages/ScanHistory";
import { Logs } from "@/pages/Logs";
import { Settings } from "@/pages/Settings";
import { SignIn } from "@/pages/SignIn";
import { SignUp } from "@/pages/SignUp";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedApp() {
  const { user, isLoaded } = useAuth();

  if (!isLoaded) return null;
  if (!user) return <Redirect to="/sign-in" />;

  return (
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
  );
}

function AppRouter() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          <Route path="/sign-in" component={SignIn} />
          <Route path="/sign-up" component={SignUp} />
          <Route>
            {() => <ProtectedApp />}
          </Route>
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <WouterRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </WouterRouter>
  );
}
