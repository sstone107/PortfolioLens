# PortfolioLens - MSR Data Intelligence Platform

## Project Overview
PortfolioLens is a secure, AI-augmented platform designed to ingest, normalize, visualize, and analyze daily loan-level data from multiple subservicers. It supports portfolio analytics, fee-based invoicing, and investor-facing reporting with emphasis on data visibility, analysis, and usability.

## Architecture
- **Frontend**: Refine.dev framework
- **Backend**: Supabase with Postgres
- **AI Integration**: AI Assistants for data analysis
- **API**: Supabase Edge Functions

## Core Modules
1. **Data Ingestion & Transformation**
   - Multiple input methods (UI uploads, SFTP pulls, email processing)
   - Support for CSV/XLSX from various subservicers
   - Configurable field mappings and normalization

2. **Portfolio Analytics**
   - Industry-standard mortgage metrics
   - Interactive dashboards with drilldowns
   - Time-series views and filter capabilities

3. **Historical Tracking**
   - Complete loan timelines
   - Delinquency roll rates and category drift
   - Point-in-time portfolio reconstruction

4. **User Management & Security**
   - Row-level security for role-based access
   - IP/geography limitations
   - Export/download permissions by role
   - Admin capabilities for user management

5. **Reporting & Notifications**
   - Standard and custom reports
   - Export capabilities
   - Comprehensive alerts system
   - Task system for flagged loans

## Development Approach
- Initial focus on core data model and ingestion capabilities
- Prioritize authentication and security early
- Iterative development of analytics and reporting features
- Continuous refinement of AI-assisted capabilities
- Manage platform-specific behaviors like Supabase schema caching during development, migration, and deployment processes

## Project Timeline
- Phase 1: Core infrastructure, data model, and authentication
- Phase 2: Data ingestion, transformation, and basic analytics
- Phase 3: Advanced analytics, reporting, and invoice engine
- Phase 4: AI features, exception monitoring, and document management
- Phase 5: API and external integrations

## Deployment Strategy
Single environment approach initially with role-based module visibility, focusing on cloud-hosted deployment with appropriate security measures.
