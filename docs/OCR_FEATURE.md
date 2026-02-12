# OCR Rate Confirmation Scanning

This feature allows users to quickly create loads by scanning rate confirmation documents using Google Cloud Vision API.

## Features

- **Automatic Text Extraction**: Upload rate confirmation documents (PDF, JPG, PNG, TIFF)
- **Smart Parsing**: Automatically extracts key information:
  - Load/BOL number
  - Pickup and delivery dates
  - Pickup and delivery locations (City, State, ZIP)
  - Rate/amount
  - Weight
  - Cargo description
  - Customer name
- **Review & Edit**: Review extracted data before accepting
- **Confidence Indicators**: Visual indicators show high/low confidence extractions
- **Training Data**: System learns from corrections to improve accuracy over time

## Setup

### 1. Get Google Cloud Vision API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Cloud Vision API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Cloud Vision API"
   - Click "Enable"
4. Create an API key:
   - Navigate to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the generated API key
5. (Recommended) Restrict the API key:
   - Click on the API key you just created
   - Under "API restrictions", select "Restrict key"
   - Choose "Cloud Vision API"
   - Click "Save"

### 2. Configure Environment Variable

1. Create a `.env` file in the project root (if it doesn't exist)
2. Add your API key:
   ```
   VITE_GOOGLE_CLOUD_VISION_API_KEY=your_api_key_here
   ```
3. Restart your development server

### 3. Apply Database Migration

1. Open your Supabase Dashboard
2. Navigate to SQL Editor
3. Open the file `database/ocr_training_data.sql`
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click "Run" to create the table

## Usage

### Scanning a Rate Confirmation

1. Click the **"Create New Load"** button
2. Click the **"📄 Scan Rate Confirmation"** button at the top of the form
3. Upload your rate confirmation document (PDF, JPG, PNG, or TIFF)
4. Wait for the document to be scanned (usually 3-5 seconds)
5. Review the extracted data in the preview panel
6. Click **"Use All Data"** to pre-fill the form with extracted information
7. Review and edit any fields as needed
8. Submit the form to create the load

### Confidence Indicators

- ✓ **Green checkmark**: High confidence (>70%) - data is likely accurate
- ⚠️ **Yellow warning**: Low confidence (<70%) - review this field carefully

### What Gets Extracted

The OCR system attempts to extract:
- **Load Number**: From patterns like "Load #", "Ref #", "BOL #"
- **Dates**: Pickup and delivery dates in various formats
- **Locations**: City, State, ZIP from address patterns
- **Rate**: Dollar amounts with "$" symbol or keywords like "Rate:", "Pay:", "Total:"
- **Weight**: Numbers followed by "lbs", "lb", or "pounds"
- **Cargo**: Commodity or description fields

## Training & Improvement

The system learns from your usage:

1. When you create a load using OCR, the system stores:
   - Original extracted text
   - Initial parsed data
   - Your final corrected data (after edits)
   
2. Future scans use this training data to improve accuracy
3. The more you use the feature, the better it gets at parsing your specific rate confirmations

## Tips for Best Results

1. **Image Quality**: Use clear, high-resolution images
2. **File Format**: PDFs and high-quality JPGs work best
3. **Orientation**: Ensure document is right-side up
4. **Lighting**: Avoid shadows or glare in photos
5. **Always Review**: Even with high confidence, verify extracted data

## Troubleshooting

### "API key is not configured" error
- Make sure you've added `VITE_GOOGLE_CLOUD_VISION_API_KEY` to your `.env` file
- Restart your development server after adding the key
- Verify the API key is correct and hasn't been restricted incorrectly

### "No text could be extracted" error
- Check image quality - ensure text is readable
- Try a different file format
- Ensure the document contains text (not just images)

### Poor extraction accuracy
- Use higher quality scans/photos
- Ensure text is clearly visible and not skewed
- The system will improve as you use it more

### Database errors when saving training data
- Verify the `ocr_training_data` table exists in Supabase
- Check Supabase dashboard for any permission issues

## API Costs

Google Cloud Vision API has a free tier:
- **First 1,000 requests per month**: Free
- **After 1,000 requests**: ~$1.50 per 1,000 requests

For typical usage (10-50 loads per day), costs are minimal.

## Security

- API key is stored in environment variables (never committed to git)
- OCR extraction happens server-side (Google Cloud)
- Training data is stored securely in your Supabase database
- No document images are permanently stored (unless you implement file storage)

## Future Enhancements

Potential improvements:
1. PDF to image conversion for multi-page PDFs
2. ML-based parsing using training data
3. Support for different rate confirmation templates
4. Batch processing of multiple documents
5. Rate confirmation file storage in Supabase Storage
