import { Authenticated, Refine } from "@refinedev/core";
// DevTools removed
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import {
  ErrorComponent,
  RefineSnackbarProvider,
  ThemedLayoutV2,
  useNotificationProvider,
} from "@refinedev/mui";

import { AuthPage, MagicLinkLogin, ProtectedRoute } from "./components/auth";
import { Unauthorized } from "./components/pages";
import { UserRoleProvider } from "./contexts/userRoleContext";
import { UserRoleType } from "./types/userRoles";
import { UserRoleManagement } from "./pages/users";
import { AdminProvider } from "./contexts/adminContext";
import { ModuleGuard } from "./components/common/ModuleGuard";
import { ImpersonationIndicator } from "./components/layout/ImpersonationIndicator";
import { ModuleType } from "./types/adminTypes";
import { ExcelImportPage } from "./pages/import/index";
import { BatchImportPage } from "./pages/import/batch";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { UserImpersonation } from "./pages/admin/UserImpersonation";
import { ModuleVisibility } from "./pages/admin/ModuleVisibility";
import { GeoRestrictions } from "./pages/admin/GeoRestrictions";

import CssBaseline from "@mui/material/CssBaseline";
import GlobalStyles from "@mui/material/GlobalStyles";
import routerBindings, {
  CatchAllNavigate,
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { dataProvider, liveProvider } from "@refinedev/supabase";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import authProvider from "./authProvider";
import { Header } from "./components/header";
import { ColorModeContextProvider } from "./contexts/color-mode";
// Import components for each resource
import {
  LoanList,
  LoanCreate,
  LoanEdit,
  LoanShow,
} from "./pages/loans";
import { supabaseClient } from "./utility";

function App() {
  return (
    <BrowserRouter>
      {/* GitHub Banner removed */}
      <RefineKbarProvider>
        <ColorModeContextProvider>
          <CssBaseline />
          <GlobalStyles styles={{ html: { WebkitFontSmoothing: "auto" } }} />
          <RefineSnackbarProvider>
            {/* DevTools removed */}
              <AdminProvider>
                <Refine
                dataProvider={dataProvider(supabaseClient)}
                liveProvider={liveProvider(supabaseClient)}
                authProvider={authProvider}
                routerProvider={routerBindings}
                notificationProvider={useNotificationProvider}
                resources={[
                  {
                    name: "loans",
                    list: "/loans",
                    create: "/loans/create",
                    edit: "/loans/edit/:id",
                    show: "/loans/show/:id",
                    meta: {
                      canDelete: true,
                    },
                  },
                  {
                    name: "data-import",
                    list: "/import",
                    meta: {
                      label: "Excel Import",
                      icon: "CloudUpload",
                    },
                  },
                  {
                    name: "batch-import",
                    list: "/batch-import",
                    meta: {
                      label: "Batch Import",
                      icon: "Storage",
                    },
                  },
                  {
                    name: "servicers",
                    list: "/servicers",
                    create: "/servicers/create",
                    edit: "/servicers/edit/:id",
                    show: "/servicers/show/:id",
                    meta: {
                      canDelete: true,
                    },
                  },
                  {
                    name: "investors",
                    list: "/investors",
                    create: "/investors/create",
                    edit: "/investors/edit/:id",
                    show: "/investors/show/:id",
                    meta: {
                      canDelete: true,
                    },
                  },
                  {
                    name: "uploads",
                    list: "/uploads",
                    create: "/uploads/create",
                    show: "/uploads/show/:id",
                    meta: {
                      canDelete: true,
                    },
                  },
                  {
                    name: "admin",
                    list: "/admin",
                    meta: {
                      label: "Admin",
                      icon: "AdminPanelSettings",
                    },
                  },
                ]}
                options={{
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                  useNewQueryKeys: true,
                  projectId: "nzMoFh-ulbLWj-RR4F3Z",
                }}
              >
                <Routes>
                  <Route
                    element={
                      <Authenticated
                        key="authenticated-inner"
                        fallback={<CatchAllNavigate to="/login" />}
                      >
                        <ThemedLayoutV2 Header={Header}>
                          <UserRoleProvider>
                            <ImpersonationIndicator />
                            <Outlet />
                          </UserRoleProvider>
                        </ThemedLayoutV2>
                      </Authenticated>
                    }
                  >
                    <Route path="/">
                      <Route index element={<NavigateToResource resource="loans" />} />
                      <Route path="loans" element={
                          <ModuleGuard module={ModuleType.LOANS} redirectTo="/unauthorized">
                            <Outlet />
                          </ModuleGuard>
                        }>
                        <Route index element={<LoanList />} />
                        <Route path="create" element={<LoanCreate />} />
                        <Route path="edit/:id" element={<LoanEdit />} />
                        <Route path="show/:id" element={<LoanShow />} />
                      </Route>

                      {/* Excel Import Module */}
                      <Route path="import" element={<ExcelImportPage />} />
                      <Route path="batch-import" element={<BatchImportPage />} />
                      
                      {/* Admin Module */}
                      <Route path="admin" element={
                          <ModuleGuard module={ModuleType.ADMIN} redirectTo="/unauthorized">
                            <Outlet />
                          </ModuleGuard>
                        }>
                        <Route index element={<AdminDashboard />} />
                        <Route path="impersonation" element={<UserImpersonation />} />
                        <Route path="module-visibility" element={<ModuleVisibility />} />
                        <Route path="geo-restrictions" element={<GeoRestrictions />} />
                        <Route path="roles" element={<UserRoleManagement />} />
                      </Route>
                      <Route
                        path="users/roles"
                        element={
                          <ProtectedRoute requiredRoles={[UserRoleType.Admin]}>
                            <UserRoleManagement />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="unauthorized"
                        element={<Unauthorized />}
                      />
                      <Route path="*" element={<ErrorComponent />} />
                    </Route>
                  </Route>

                  <Route
                    element={
                      <Authenticated
                        key="authenticated-outer"
                        fallback={<Outlet />}
                      >
                        <NavigateToResource />
                      </Authenticated>
                    }
                  >
                    <Route
                      path="/login"
                      element={
                        <AuthPage
                          type="login"
                          formProps={{
                            defaultValues: {
                              email: "info@refine.dev",
                              password: "refine-supabase",
                            },
                          }}
                        />
                      }
                    />
                    <Route
                      path="/register"
                      element={<AuthPage type="register" />}
                    />
                    <Route
                      path="/forgot-password"
                      element={<AuthPage type="forgotPassword" />}
                    />
                    <Route
                      path="/magic-link"
                      element={<MagicLinkLogin />}
                    />
                  </Route>
                </Routes>

                <RefineKbar />
                <UnsavedChangesNotifier />
                <DocumentTitleHandler />
                </Refine>
                {/* DevTools Panel removed */}
              </AdminProvider>
            {/* End of DevTools wrapper */}
          </RefineSnackbarProvider>
        </ColorModeContextProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
