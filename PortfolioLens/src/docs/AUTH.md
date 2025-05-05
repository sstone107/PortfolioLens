# PortfolioLens Authentication System

This document outlines the authentication system used in PortfolioLens, which leverages Supabase Auth for secure user management.

## Authentication Methods

PortfolioLens supports multiple authentication methods:

1. **Email/Password**: Traditional authentication with email and password
2. **Magic Link**: Passwordless authentication via email
3. **OAuth Provider**:
   - Google

## Implementation Details

### Auth Provider

The authentication logic is centralized in `src/authProvider.ts`, which implements the Refine.dev `AuthBindings` interface with methods for:

- Login (email/password and OAuth)
- Registration
- Password management (reset, forgot, update)
- Session validation
- User permissions
- User identity

### Auth Components

Custom authentication components are located in `src/components/auth/`:

- **AuthPage.tsx**: Enhanced login, registration, and password reset pages with social login options
- **MagicLinkLogin.tsx**: Passwordless authentication via email magic links

## Authentication Flow

1. **Email/Password Login**:
   - User enters credentials on the login page
   - Credentials are validated against Supabase Auth
   - On success, user is redirected to the dashboard

2. **Magic Link Login**:
   - User enters email on the magic link page
   - Supabase sends a secure one-time link to the user's email
   - User clicks the link and is automatically authenticated

3. **OAuth Login**:
   - User clicks a social login button
   - User is redirected to the provider's authentication page
   - After successful authentication, user is redirected back to the app
   - Supabase creates or updates the user account

## Supabase Configuration

To enable these authentication methods in your Supabase project:

1. **Email/Password and Magic Link**:
   - Enabled by default in Supabase
   - Configure email templates in Supabase Dashboard: Authentication > Email Templates

2. **Google OAuth**:
   - Configure in Supabase Dashboard: Authentication > OAuth Providers > Google
   - Steps:
     - Create a Google Cloud project and set up OAuth credentials
     - Add the client ID and secret to Supabase
     - Configure redirect URL as `https://<your-app-url>.com/`

## Security Considerations

- All authentication is handled by Supabase Auth, which follows security best practices
- User passwords are never stored or handled directly by the application code
- Auth tokens are securely stored and managed by the Supabase client
- Session timeouts and token refresh are handled automatically

## User Roles and Permissions

User roles and permissions are covered in the Role-Based Access Control (RBAC) documentation.

## Testing Authentication

1. **Email/Password**:
   - Create test users in the Supabase Dashboard
   - Test login, registration, and password reset flows

2. **Magic Link**:
   - Use test emails for development
   - Check Supabase Auth logs for magic link URLs during development

3. **OAuth Providers**:
   - Create test accounts for each OAuth provider
   - Test the complete OAuth flow for each provider
