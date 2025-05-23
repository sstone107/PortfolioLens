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
import { LoanSearchProvider } from "./contexts/loanSearchContext";
import { ModuleGuard } from "./components/common/ModuleGuard";
import { ImpersonationIndicator } from "./components/layout/ImpersonationIndicator";
import { ModuleType } from "./types/adminTypes";
// Import-related components
import ImportHomePage from './pages/import/index';
import BatchImportPage from './pages/import/batch';
import TemplateManagerPage from './pages/import/templates';
import ImportHistoryList from './pages/import/history';
import { ImportStatusPage } from './pages/import/status';
import { GoogleDriveSyncConfig } from './pages/import/google-drive-config';
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { UserImpersonation } from "./pages/admin/UserImpersonation";
import { ModuleVisibility } from "./pages/admin/ModuleVisibility";
import { GeoRestrictions } from "./pages/admin/GeoRestrictions";
import UserManagement from "./pages/admin/UserManagement";
import { PartnersPage } from "./pages/partners";
import { DocCustodianCreate, DocCustodianEdit, DocCustodianShow } from "./pages/partners/doc-custodians";
import { SellerCreate, SellerEdit, SellerShow } from "./pages/partners/sellers";
import { PriorServicerCreate, PriorServicerEdit, PriorServicerShow } from "./pages/partners/prior-servicers";
import { LoanDetailView } from "./components/loans";
import { HomePage } from "./pages/home/HomePage";
import { TitleManager } from "./components/common/TitleManager";

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import PieChartIcon from "@mui/icons-material/PieChart";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import TableChartIcon from "@mui/icons-material/TableChart";
import MapIcon from "@mui/icons-material/Map";
import BusinessIcon from "@mui/icons-material/Business";
import SupervisorAccountIcon from "@mui/icons-material/SupervisorAccount";
import HandshakeIcon from "@mui/icons-material/Handshake";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
import StorefrontIcon from "@mui/icons-material/Storefront";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import DescriptionIcon from "@mui/icons-material/Description";
import SearchIcon from "@mui/icons-material/Search";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import HomeIcon from "@mui/icons-material/Home";
import FileUploadIcon from "@mui/icons-material/FileUpload";
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
  LoanPortfolioMapping,
  LoanSearch,
} from "./pages/loans";
import {
  ServicerList,
  ServicerCreate,
  ServicerEdit,
  ServicerShow,
} from "./pages/servicers";
import {
  InvestorList,
  InvestorCreate,
  InvestorEdit,
  InvestorShow,
} from "./pages/investors";
import {
  PortfolioList,
  PortfolioCreate,
  PortfolioEdit,
  PortfolioShow,
  PortfolioDashboard,
} from "./pages/portfolios";
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
                options={{
                  // Use the text property as expected by Refine
                  title: {
                    text: "PortfolioLens",
                    icon: <ZoomInIcon style={{ color: "#1a8754", fontSize: 36 }} />
                  },
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                  useNewQueryKeys: true,
                  projectId: "nzMoFh-ulbLWj-RR4F3Z",
                }}
                resources={[
                  // Home Dashboard
                  {
                    name: "home",
                    list: "/home",
                    meta: {
                      label: "Home",
                      icon: <HomeIcon />,
                    },
                  },
                  
                  // Core Business Resources - Portfolios & Loans
                  {
                    name: "portfolios",
                    list: "/portfolios",
                    create: "/portfolios/create",
                    edit: "/portfolios/edit/:id",
                    show: "/portfolios/show/:id",
                    meta: {
                      canDelete: true,
                      icon: <PieChartIcon />,
                    },
                  },
                  {
                    name: "loans",
                    list: "/loans",
                    create: "/loans/create",
                    edit: "/loans/edit/:id",
                    show: "/loans/show/:id",
                    meta: {
                      canDelete: true,
                      icon: <DescriptionIcon />,
                    },
                  },
                  {
                    name: "loan-detail",
                    list: "/loans/detail/:id",
                    show: "/loans/detail/:id",
                    meta: {
                      label: "Loan Details",
                      icon: <AssignmentIndIcon />,
                      parent: "loans",
                    },
                  },
                  {
                    name: "loan-portfolio-mapping",
                    list: "/loans/portfolio-mapping",
                    meta: {
                      label: "Loan-Portfolio Mapping",
                      icon: <MapIcon />,
                      parent: "loans",
                    },
                  },
                  {
                    name: "loan-search",
                    list: "/loans/search",
                    meta: {
                      label: "Advanced Search",
                      icon: <SearchIcon />,
                      parent: "loans",
                    },
                  },
                  
                  // New Partners Parent Menu Item
                  {
                    name: "partners_menu", // Unique name for the menu item itself
                    meta: {
                      label: "Partners",
                      icon: <HandshakeIcon />, // Using the imported HandshakeIcon
                    },
                  },
                  // Doc Custodians Resource (now under Partners)
                   {
                     name: "doc_custodians",
                     list: "/partners?tab=0", // Keep original list path logic
                     create: "/partners/doc-custodians/create",
                     edit: "/partners/doc-custodians/edit/:id",
                     show: "/partners/doc-custodians/show/:id",
                     meta: {
                       label: "Doc Custodians",
                       icon: <FolderSpecialIcon />,
                       canDelete: true,
                       parent: "partners_menu", // Nest under the new Partners item
                     },
                   },
                   // Sellers Resource (now under Partners)
                   {
                     name: "sellers",
                     list: "/partners?tab=1", // Keep original list path logic
                     create: "/partners/sellers/create",
                     edit: "/partners/sellers/edit/:id",
                     show: "/partners/sellers/show/:id",
                     meta: {
                       label: "Sellers",
                       icon: <StorefrontIcon />,
                       canDelete: true,
                       parent: "partners_menu", // Nest under the new Partners item
                     },
                   },
                   // Prior Servicers Resource (now under Partners)
                   {
                     name: "prior_servicers",
                     list: "/partners?tab=2", // Keep original list path logic
                     create: "/partners/prior-servicers/create",
                     edit: "/partners/prior-servicers/edit/:id",
                     show: "/partners/prior-servicers/show/:id",
                     meta: {
                       label: "Prior Servicers",
                       icon: <SupportAgentIcon />, // Original icon
                       canDelete: true,
                       parent: "partners_menu", // Nest under the new Partners item
                     },
                   },
                  // Servicers Resource (now under Partners)
                  {
                    name: "servicers",
                    list: "/servicers",
                    create: "/servicers/create",
                    edit: "/servicers/edit/:id",
                    show: "/servicers/show/:id",
                    meta: {
                      canDelete: true,
                      icon: <AccountBalanceIcon />, // Restoring original icon
                      parent: "partners_menu", // Nest under the new Partners item
                    },
                  },
                  // Investors Resource (now under Partners)
                  {
                    name: "investors",
                    list: "/investors",
                    create: "/investors/create",
                    edit: "/investors/edit/:id",
                    show: "/investors/show/:id",
                    meta: {
                      canDelete: true,
                      icon: <TrendingUpIcon />,
                      parent: "partners_menu", // Nest under the new Partners item
                    },
                  },
                  // Existing Partners Resource (routes only, no top-level menu item)
                  {
                     name: "partners", // This resource handles the routing for /partners/*
                     list: "/partners", // Base path for the partners page
                     // No create/edit/show at the top level for this route group
                     meta: {
                       // This resource might not need direct menu representation if handled by specific sub-routes or a dedicated page
                       // For now, assuming it's just for routing as before. Let's hide it from the main menu explicitly.
                       hide: true, 
                     },
                  },
                  // Import Resource
                  {
                    name: "import",
                    list: "/import",
                    meta: {
                      label: "Data Import",
                      icon: <FileUploadIcon />,
                    },
                  },
                  // Admin Section
                  {
                    name: "admin",
                    list: "/admin",
                    meta: {
                      label: "Administration",
                      icon: <SupervisorAccountIcon />,
                    },
                  },
                ]}

              >
                <TitleManager />
                <Routes>
                  <Route
                    element={
                      <Authenticated
                        key="authenticated-inner"
                        fallback={<CatchAllNavigate to="/login" />}
                      >
                        <ThemedLayoutV2 Header={Header}>
                          <UserRoleProvider>
                            <LoanSearchProvider>
                              <ImpersonationIndicator />
                              <Outlet />
                            </LoanSearchProvider>
                          </UserRoleProvider>
                        </ThemedLayoutV2>
                      </Authenticated>
                    }
                  >
                    <Route path="/">
                      <Route index element={<NavigateToResource resource="home" />} />
                      
                      {/* Home Dashboard */}
                      <Route path="home" element={<HomePage />} />
                      
                      <Route path="portfolios" element={
                          <ModuleGuard module={ModuleType.LOANS} redirectTo="/unauthorized">
                            <Outlet />
                          </ModuleGuard>
                        }>
                        <Route index element={<PortfolioList />} />
                        <Route path="dashboard" element={<PortfolioDashboard />} />
                        <Route path="create" element={<PortfolioCreate />} />
                        <Route path="edit/:id" element={<PortfolioEdit />} />
                        <Route path="show/:id" element={<PortfolioShow />} />
                      </Route>
                      
                      <Route path="loans" element={
                          <ModuleGuard module={ModuleType.LOANS} redirectTo="/unauthorized">
                            <Outlet />
                          </ModuleGuard>
                        }>
                        <Route index element={<LoanList />} />
                        <Route path="create" element={<LoanCreate />} />
                        <Route path="edit/:id" element={<LoanEdit />} />
                        <Route path="show/:id" element={<LoanShow />} />
                        <Route path="portfolio-mapping" element={<LoanPortfolioMapping />} />
                        <Route path="search" element={<LoanSearch />} />
                        <Route path="detail/:id" element={<LoanDetailView />} />
                      </Route>

                      <Route path="servicers" element={
                          <ModuleGuard module={ModuleType.SERVICERS} redirectTo="/unauthorized">
                            <Outlet />
                          </ModuleGuard>
                        }>
                        <Route index element={<ServicerList />} />
                        <Route path="create" element={<ServicerCreate />} />
                        <Route path="edit/:id" element={<ServicerEdit />} />
                        <Route path="show/:id" element={<ServicerShow />} />
                      </Route>

                      <Route path="investors" element={
                          <ModuleGuard module={ModuleType.INVESTORS} redirectTo="/unauthorized">
                            <Outlet />
                          </ModuleGuard>
                        }>
                        <Route index element={<InvestorList />} />
                        <Route path="create" element={<InvestorCreate />} />
                        <Route path="edit/:id" element={<InvestorEdit />} />
                        <Route path="show/:id" element={<InvestorShow />} />
                      </Route>

                      {/* Partners Module */}
                      <Route path="partners" element={
                          <ModuleGuard module={ModuleType.PARTNERS} redirectTo="/unauthorized">
                            <Outlet />
                          </ModuleGuard>
                        }>
                        <Route index element={<PartnersPage />} />
                        
                        {/* Doc Custodians Routes */}
                        <Route path="doc-custodians/create" element={<DocCustodianCreate />} />
                        <Route path="doc-custodians/edit/:id" element={<DocCustodianEdit />} />
                        <Route path="doc-custodians/show/:id" element={<DocCustodianShow />} />
                        
                        {/* Sellers Routes */}
                        <Route path="sellers/create" element={<SellerCreate />} />
                        <Route path="sellers/edit/:id" element={<SellerEdit />} />
                        <Route path="sellers/show/:id" element={<SellerShow />} />
                        
                        {/* Prior Servicers Routes */}
                        <Route path="prior-servicers/create" element={<PriorServicerCreate />} />
                        <Route path="prior-servicers/edit/:id" element={<PriorServicerEdit />} />
                        <Route path="prior-servicers/show/:id" element={<PriorServicerShow />} />
                      </Route>

                      {/* Excel Import Module */}
                  <Route path="import" element={
                      <ModuleGuard module={ModuleType.ADMIN} redirectTo="/unauthorized">
                        <Outlet />
                      </ModuleGuard>
                    }>
                    <Route index element={<ImportHomePage />} />
                    <Route path="batch" element={<BatchImportPage />} />
                    <Route path="templates" element={<TemplateManagerPage />} />
                    <Route path="history" element={<ImportHistoryList />} />
                    <Route path="status/:jobId" element={<ImportStatusPage />} />
                    <Route path="google-drive-config" element={<GoogleDriveSyncConfig />} />
                  </Route>
                      
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
                        <Route path="users" element={<UserManagement />} />
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
                              email: "user@greenwaymortgage.com",
                              password: "password",
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