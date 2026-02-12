# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Features

### OCR Rate Confirmation Scanning ✨ NEW
Quickly create loads by scanning rate confirmation documents. The system automatically extracts load details, dates, addresses, rates, and more using Google Cloud Vision API.

**[View full OCR documentation](./docs/OCR_FEATURE.md)**

Quick setup:
1. Get a Google Cloud Vision API key
2. Add `VITE_GOOGLE_CLOUD_VISION_API_KEY` to `.env` (see `.env.example`)
3. Run the database migration in `database/ocr_training_data.sql`
4. Click "Scan Rate Confirmation" when creating a new load

## Getting Started

```bash
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and configure:
- `VITE_GOOGLE_CLOUD_VISION_API_KEY` - For OCR rate confirmation scanning
