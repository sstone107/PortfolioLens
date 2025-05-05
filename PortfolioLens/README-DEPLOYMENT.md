# PortfolioLens Deployment Guide

## Hosting Configuration

### Frontend (Vercel)

PortfolioLens frontend is deployed on Vercel which provides:
- Automatic deployments from git
- Preview environments for PRs
- SSL/TLS certificates
- CDN distribution
- Environment variable management

### Backend (Supabase)

The backend uses Supabase which provides:
- PostgreSQL database
- Authentication services
- Row-level security
- Storage functionality
- Realtime subscriptions

## Environments

### Development
- Local development environment
- Uses local `.env` file for environment variables
- Connect to development Supabase project

### Staging
- Automatically deployed from the `develop` branch
- Accessible at: staging.portfoliolens.com (once configured)
- Uses staging environment variables in Vercel

### Production
- Automatically deployed from the `main` branch
- Accessible at: portfoliolens.com (once configured)
- Uses production environment variables in Vercel

## CI/CD Pipeline

The CI/CD pipeline is implemented with GitHub Actions:

1. **Build and Test**:
   - Runs on every push and PR to main/develop
   - Installs dependencies
   - Type checks the codebase
   - Runs linting
   - Executes tests

2. **Preview Deployment**:
   - Runs on PRs to main/develop
   - Deploys to a Vercel preview environment
   - Comments on the PR with the preview URL

3. **Production Deployment**:
   - Runs on push to main
   - Deploys to Vercel production environment

## Required Secrets

The following secrets must be configured in GitHub:

- `VERCEL_TOKEN`: API token from Vercel
- `VERCEL_ORG_ID`: Vercel organization ID
- `VERCEL_PROJECT_ID`: Vercel project ID
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key

## Setting Up Vercel

1. Create a Vercel account at https://vercel.com/signup
2. Install Vercel CLI: `npm i -g vercel`
3. Connect your GitHub repository:
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Configure project settings
4. Set environment variables in Vercel dashboard:
   - Add all variables from `.env.example`
   - Use different values for each environment (development, preview, production)

## Manual Deployment

If needed, you can manually deploy using:

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to preview
cd PortfolioLens
vercel

# Deploy to production
vercel --prod
```

## Monitoring and Logging

- Use Vercel Analytics for frontend monitoring
- Supabase provides database monitoring through the dashboard
- Consider adding Sentry for error tracking

## Security Measures

1. **Security Headers**: Implemented in `vercel.json`
2. **API Rate Limiting**: Handled by Supabase
3. **CORS Configuration**: Set appropriate origins in Supabase
4. **Environment Variables**: Stored securely in Vercel

## Troubleshooting

If deployment fails:
1. Check build logs in Vercel dashboard
2. Verify environment variables
3. Run build locally: `npm run build`
4. Ensure all dependencies are up to date
