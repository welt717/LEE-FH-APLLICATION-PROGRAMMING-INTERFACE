const expressAsyncHandler = require('express-async-handler');
const {
  safeQuery,
  getConnection,
  releaseConnection,
} = require('../../configurations/sqlConfig/db');
const NodeCache = require('node-cache');
const ExcelJS = require('exceljs');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

// Cache Setup with memory leak protection
const coffinCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false,
  maxKeys: 1000,
});

// Memory leak protection - cleanup intervals
const cleanupIntervals = new Set();

// Image processing configuration
const IMAGE_CONFIG = {
  TARGET_WIDTH: 1920, // High resolution for clarity
  TARGET_HEIGHT: 1080, // 16:9 aspect ratio
  QUALITY: 90, // High quality WebP
  FORMAT: 'webp', // Modern web format
  OUTPUT_DIR: 'public/uploads/coffins', //output directory
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB max
};

// Utility to generate RFID
const generateRFID = (name) => {
  return 'RFID-' + name.toLowerCase().replace(/\s/g, '-') + '-' + Date.now();
};

// Utility to generate Coffin ID
const generateCoffinId = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `COF-${timestamp}-${random}`;
};

// Current exchange rate
const EXCHANGE_RATES = {
  USD: 150, // 1 USD = 150 KES
  KES: 1,
};

// Memory management - cleanup function
const cleanupResources = () => {
  try {
    // Clear any intervals
    cleanupIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    cleanupIntervals.clear();

    // Clear cache periodically to prevent memory buildup
    coffinCache.flushAll();
    console.log('✅ Cache cleaned up');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
};

// Setup periodic cleanup (every hour)
const cleanupInterval = setInterval(cleanupResources, 60 * 60 * 1000);
cleanupIntervals.add(cleanupInterval);

// Process shutdown handler
process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  cleanupResources();
  clearInterval(cleanupInterval);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  cleanupResources();
  clearInterval(cleanupInterval);
  process.exit(0);
});

// Ensure output directory exists
const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (error) {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dirPath}`);
  }
};

// Generate proper image names
const generateImageName = (coffinId, index, originalName) => {
  const timestamp = Date.now();
  const cleanCoffinId = coffinId.replace(/[^a-zA-Z0-9-_]/g, '-');
  const cleanOriginalName = path
    .parse(originalName)
    .name.replace(/[^a-zA-Z0-9-_]/g, '-');

  return `coffin-${cleanCoffinId}-image-${index + 1}-${cleanOriginalName}-${timestamp}.${IMAGE_CONFIG.FORMAT}`;
};

// Enhanced image processing with Sharp
const processImageWithSharp = async (
  inputBuffer,
  outputPath,
  coffinId,
  imageIndex,
  originalName,
) => {
  try {
    // Create Sharp instance
    const image = sharp(inputBuffer);

    // Get original metadata
    const metadata = await image.metadata();

    console.log(`🖼️ Processing image ${imageIndex + 1}: ${originalName}`);
    console.log(
      `   Original size: ${metadata.width}x${metadata.height}, Format: ${metadata.format}`,
    );

    // Process image with high quality settings
    const processedImage = await image
      .resize({
        width: IMAGE_CONFIG.TARGET_WIDTH,
        height: IMAGE_CONFIG.TARGET_HEIGHT,
        fit: 'cover', // Ensure all images have same dimensions
        position: 'center',
        withoutEnlargement: false, // Allow enlarging smaller images for consistency
      })
      .webp({
        quality: IMAGE_CONFIG.QUALITY,
        effort: 6, // Higher effort for better compression (1-6)
      })
      .toBuffer();

    // Write processed image to file
    await sharp(processedImage).toFile(outputPath);

    // Get final image stats
    const stats = await fs.stat(outputPath);
    console.log(
      `   Processed size: ${IMAGE_CONFIG.TARGET_WIDTH}x${IMAGE_CONFIG.TARGET_HEIGHT}`,
    );
    console.log(`   Final file size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   Saved as: ${path.basename(outputPath)}`);

    return {
      success: true,
      path: outputPath,
      size: stats.size,
      dimensions: `${IMAGE_CONFIG.TARGET_WIDTH}x${IMAGE_CONFIG.TARGET_HEIGHT}`,
      format: IMAGE_CONFIG.FORMAT,
    };
  } catch (error) {
    console.error(`❌ Error processing image ${originalName}:`, error);
    throw new Error(`Image processing failed: ${error.message}`);
  }
};

// Safe file operations to prevent memory leaks
const safeFileOperation = async (operation, fileData = null) => {
  try {
    if (fileData && Buffer.isBuffer(fileData)) {
      // Limit file size to prevent memory issues
      if (fileData.length > IMAGE_CONFIG.MAX_FILE_SIZE) {
        throw new Error(
          `File size too large. Maximum ${IMAGE_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB allowed.`,
        );
      }
    }
    return await operation();
  } catch (error) {
    // Explicitly clear file data from memory
    if (fileData) {
      fileData = null;
    }
    throw error;
  } finally {
    // Force garbage collection hint in Node.js >= 12
    if (global.gc) {
      global.gc();
    }
  }
};

// Process multiple images with consistent quality and size
const processAllImages = async (files, coffinId) => {
  await ensureDirectoryExists(IMAGE_CONFIG.OUTPUT_DIR);

  const processedImages = [];
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    try {
      const file = files[i];
      const imageName = generateImageName(coffinId, i, file.originalname);
      const outputPath = path.join(IMAGE_CONFIG.OUTPUT_DIR, imageName);

      const result = await safeFileOperation(
        () =>
          processImageWithSharp(
            file.buffer,
            outputPath,
            coffinId,
            i,
            file.originalname,
          ),
        file.buffer,
      );

      if (result.success) {
        // Store web-accessible path (remove 'public/' from path)
        const webPath = outputPath.replace('public/', '');
        processedImages.push(webPath);
      }
    } catch (error) {
      errors.push(`Image ${i + 1}: ${error.message}`);
      console.error(`❌ Failed to process image ${i + 1}:`, error);
    }
  }

  if (errors.length > 0 && processedImages.length === 0) {
    throw new Error(`All images failed to process: ${errors.join('; ')}`);
  }

  if (errors.length > 0) {
    console.warn(`⚠️ Some images failed to process:`, errors);
  }

  return processedImages;
};

// Database connection management
const withDatabaseConnection = async (operation) => {
  let connection;
  try {
    connection = await getConnection();
    const result = await operation(connection);
    return result;
  } catch (error) {
    throw error;
  } finally {
    if (connection) {
      await releaseConnection(connection);
    }
  }
};

// Input validation and sanitization
const validateCoffinData = (data) => {
  const errors = [];

  if (!data.type || data.type.trim().length === 0) {
    errors.push('Coffin type is required');
  }

  if (!data.material || data.material.trim().length === 0) {
    errors.push('Material is required');
  }

  if (!data.exact_price || isNaN(parseFloat(data.exact_price))) {
    errors.push('Valid price is required');
  } else if (parseFloat(data.exact_price) < 0) {
    errors.push('Price cannot be negative');
  }

  if (!data.currency || !['KES', 'USD'].includes(data.currency)) {
    errors.push('Valid currency (KES or USD) is required');
  }

  if (
    data.quantity &&
    (isNaN(parseInt(data.quantity)) || parseInt(data.quantity) < 0)
  ) {
    errors.push('Quantity must be a non-negative number');
  }

  // Prevent excessively long inputs
  if (data.type && data.type.length > 255) {
    errors.push('Coffin type too long (max 255 characters)');
  }

  if (data.material && data.material.length > 255) {
    errors.push('Material description too long (max 255 characters)');
  }

  return errors;
};

/* ===============================
   ✅ CREATE COFFIN WITH PROCESSED HIGH-QUALITY IMAGES
   =============================== */

const createCoffin = expressAsyncHandler(async (req, res) => {
  let connection;

  // Memory protection - limit files

  if (req.files && req.files.length > 10) {
    return res.status(400).json({
      success: false,
      error: 'Maximum 10 images allowed per coffin',
    });
  }

  try {
    console.log('=== COFFIN CREATION REQUEST ===');
    console.log('Body:', {
      ...req.body,
      files: req.files ? `${req.files.length} files` : 'none',
    });

    const {
      coffin_id,
      type,
      material,
      exact_price,
      currency,
      quantity,
      supplier,
      origin,
      color,
      size,
      created_by,
      category,
    } = req.body;

    // Validate input
    const validationErrors = validateCoffinData(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: validationErrors.join(', '),
      });
    }

    // Calculate prices based on currency
    const price = parseFloat(exact_price);
    let priceKES, priceUSD, exchangeRateUsed;

    if (currency === 'USD') {
      priceUSD = price;
      priceKES = price * EXCHANGE_RATES.USD;
      exchangeRateUsed = EXCHANGE_RATES.USD;
    } else {
      priceKES = price;
      priceUSD = price / EXCHANGE_RATES.USD;
      exchangeRateUsed = EXCHANGE_RATES.USD;
    }

    // Generate coffin ID if not provided
    const finalCoffinId = coffin_id || generateCoffinId();

    // Process images with Sharp for high quality and consistency
    let image_urls = [];
    if (req.files && req.files.length > 0) {
      console.log(`🔄 Processing ${req.files.length} images with Sharp...`);

      image_urls = await safeFileOperation(() =>
        processAllImages(req.files, finalCoffinId),
      );

      console.log(
        `✅ Successfully processed ${image_urls.length}/${req.files.length} images`,
      );
      console.log('📁 Processed images:', image_urls);
    }

    // Find user ID
    let userId = null;
    if (created_by) {
      const createdByTrimmed = created_by.trim();
      const users = await safeQuery(
        'SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(name) = LOWER(?) LIMIT 1',
        [createdByTrimmed, createdByTrimmed],
      );

      const user = users[0];
      if (!user) {
        return res.status(400).json({
          success: false,
          error: 'Invalid username or name in created_by.',
        });
      }
      userId = user.id;
    } else if (req.user && req.user.id) {
      userId = req.user.id;
    } else {
      userId = 1; // fallback default user ID
    }

    connection = await getConnection();

    try {
      await connection.beginTransaction();

      // Check for duplicate custom ID
      if (coffin_id) {
        const existingCoffins = await safeQuery(
          'SELECT coffin_id FROM coffins WHERE custom_id = ?',
          [coffin_id],
        );
        if (existingCoffins.length > 0) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            error: 'Custom ID already exists. Use a different ID.',
          });
        }
      }

      // Insert coffin with currency and pricing fields
      const insertCoffinSql = `
        INSERT INTO coffins 
        (custom_id, type, material, exact_price, currency, price_usd, exchange_rate, 
         quantity, supplier, origin, color, size, category, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      const result = await safeQuery(insertCoffinSql, [
        finalCoffinId,
        type.trim(),
        material.trim(),
        priceKES,
        currency,
        priceUSD,
        exchangeRateUsed,
        parseInt(quantity) || 1,
        supplier ? supplier.trim() : null,
        origin ? origin.trim() : null,
        color ? color.trim() : null,
        size ? size.trim() : null,
        category || 'locally_made',
        userId,
      ]);

      const coffinDbId = result.insertId;

      // Insert coffin images in batches to prevent memory issues
      if (image_urls.length > 0) {
        const batchSize = 5;

        for (let i = 0; i < image_urls.length; i += batchSize) {
          const batch = image_urls.slice(i, i + batchSize);

          // Build valid SQL placeholders dynamically
          const insertImagesSql = `
            INSERT INTO coffin_images (coffin_id, image_url, created_at)
            VALUES ${batch.map(() => '(?, ?, NOW())').join(', ')}
          `;

          // Flatten values: [coffin_id, image_url, coffin_id, image_url...]
          const flatParams = batch.flatMap((url) => [coffinDbId, url]);

          await safeQuery(insertImagesSql, flatParams);
        }
      }

      await connection.commit();

      // Clear cache
      coffinCache.del('allCoffins');
      coffinCache.del('coffinAnalytics');

      // Explicitly clean up request data
      req.body = null;
      if (req.files) {
        req.files.length = 0;
      }

      res.status(201).json({
        success: true,
        message:
          '✅ Coffin created successfully with high-quality processed images',
        coffin_id: finalCoffinId,
        database_id: coffinDbId,
        images: {
          count: image_urls.length,
          urls: image_urls,
          format: IMAGE_CONFIG.FORMAT,
          dimensions: `${IMAGE_CONFIG.TARGET_WIDTH}x${IMAGE_CONFIG.TARGET_HEIGHT}`,
          quality: IMAGE_CONFIG.QUALITY,
        },
        pricing: {
          price_kes: priceKES.toFixed(2),
          price_usd: priceUSD.toFixed(2),
          exchange_rate: exchangeRateUsed,
          original_currency: currency,
        },
        data: {
          coffin_id: finalCoffinId,
          type,
          material,
          category: category || 'locally_made',
          exact_price: priceKES.toFixed(2),
          currency,
          quantity: quantity || 1,
          created_by: userId,
          images: image_urls,
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (err) {
    console.error('❌ DATABASE ERROR inserting coffin:', err);

    // Specific error handling
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'Custom ID already exists. Use a different ID.',
      });
    }
    if (err.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({
        success: false,
        error: 'Invalid user reference. Please check the creator.',
      });
    }
    if (err.code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({
        success: false,
        error: 'One or more fields exceed maximum length.',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error: ' + err.message,
    });
  } finally {
    if (connection) {
      await releaseConnection(connection);
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
});

/* ===============================
   ✅ GET ALL COFFINS WITH IMAGES (MEMORY SAFE)
   =============================== */

const getAllCoffins = expressAsyncHandler(async (req, res) => {
  try {
    let coffins = coffinCache.get('allCoffins');

    if (!coffins) {
      const sql = `
  SELECT 
    c.coffin_id, c.custom_id, c.type, c.material, c.exact_price, c.currency, 
    c.price_usd, c.exchange_rate, c.quantity, c.supplier, c.origin, c.color, 
    c.size, c.category, c.created_at, c.updated_at,
    u.name as created_by_name,
    (SELECT GROUP_CONCAT(ci.image_url)
       FROM coffin_images ci
       WHERE ci.coffin_id = c.coffin_id
    ) as image_urls
  FROM coffins c
  LEFT JOIN users u ON c.created_by = u.id
  ORDER BY c.created_at DESC
  LIMIT 1000
`;

      coffins = await safeQuery(sql);

      // Process coffins
      coffins = coffins.map((coffin) => {
        const exactPrice = coffin.exact_price ? Number(coffin.exact_price) : 0;
        const priceUsd = coffin.price_usd ? Number(coffin.price_usd) : 0;

        // Merge images and remove duplicates
        const images = [];

        if (coffin.image_url) images.push(coffin.image_url);
        if (coffin.image_urls) images.push(...coffin.image_urls.split(','));

        const uniqueImages = [...new Set(images)].slice(0, 10);

        return {
          ...coffin,
          exact_price: exactPrice,
          price_usd: priceUsd,
          price_kes: exactPrice,
          display_price:
            coffin.currency === 'USD'
              ? `$${priceUsd.toFixed(2)} (Ksh ${exactPrice.toFixed(2)})`
              : `Ksh ${exactPrice.toFixed(2)} ($${priceUsd.toFixed(2)})`,
          images: uniqueImages,
          primary_image: uniqueImages[0] || null,
        };
      });

      coffinCache.set('allCoffins', coffins);
    }

    res.status(200).json({
      success: true,
      data: coffins,
      count: coffins.length,
      message:
        coffins.length === 0
          ? 'No coffins found'
          : 'Coffins fetched successfully',
    });
  } catch (error) {
    console.error('❌ Error fetching coffins:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coffins',
      error: error.message,
    });
  } finally {
    if (global.gc) global.gc();
  }
});

/* ===============================
   ✅ GET COFFIN BY ID (MEMORY SAFE)
   =============================== */
const getCoffinById = expressAsyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coffin ID',
      });
    }

    const cacheKey = `coffin_${id}`;
    let coffin = coffinCache.get(cacheKey);

    if (!coffin) {
      const sql = `
        SELECT 
          c.*,
          u.name as created_by_name,
          u.username as created_by_username,
          GROUP_CONCAT(ci.image_url) as image_urls
        FROM coffins c
        LEFT JOIN users u ON c.created_by = u.id
        LEFT JOIN coffin_images ci ON c.coffin_id = ci.coffin_id
        WHERE c.coffin_id = ?
        GROUP BY c.coffin_id
      `;

      const coffins = await safeQuery(sql, [parseInt(id)]);

      if (coffins.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Coffin not found',
        });
      }

      coffin = coffins[0];
      coffin.image_urls = coffin.image_urls
        ? coffin.image_urls.split(',').slice(0, 10)
        : [];

      // Cache for 5 minutes
      coffinCache.set(cacheKey, coffin, 300);
    }

    res.status(200).json({
      success: true,
      data: coffin,
    });
  } catch (error) {
    console.error('❌ Error fetching coffin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coffin',
    });
  }
});

/* ===============================
   ✅ UPDATE COFFIN WITH MULTIPLE IMAGES (MEMORY SAFE)
   =============================== */
const updateCoffin = expressAsyncHandler(async (req, res) => {
  let connection;

  try {
    const { id } = req.params;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coffin ID',
      });
    }

    const {
      type,
      material,
      exact_price,
      currency,
      quantity,
      supplier,
      origin,
      color,
      size,
      category,
    } = req.body;

    // Memory protection - limit files
    if (req.files && req.files.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 images allowed',
      });
    }

    // Check if coffin exists
    const existingCoffin = await safeQuery(
      'SELECT * FROM coffins WHERE coffin_id = ?',
      [parseInt(id)],
    );

    if (existingCoffin.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Coffin not found',
      });
    }

    connection = await getConnection();

    try {
      await connection.beginTransaction();

      // Handle new image uploads with memory protection
      if (req.files && req.files.length > 0) {
        const image_urls = await safeFileOperation(() => {
          return req.files.map((file) => `/uploads/coffins/${file.filename}`);
        });

        // Delete old images and insert new ones in batches
        await safeQuery('DELETE FROM coffin_images WHERE coffin_id = ?', [id]);

        if (image_urls.length > 0) {
          const batchSize = 5;
          for (let i = 0; i < image_urls.length; i += batchSize) {
            const batch = image_urls.slice(i, i + batchSize);
            const imageValues = batch.map((url) => [parseInt(id), url]);

            const insertImagesSql = `
              INSERT INTO coffin_images (coffin_id, image_url, created_at)
              VALUES ?
            `;
            await safeQuery(insertImagesSql, [imageValues]);
          }
        }
      }

      // Calculate prices if currency or price changed
      let updateFields = {};
      if (exact_price !== undefined || currency !== undefined) {
        const currentPrice =
          exact_price !== undefined
            ? parseFloat(exact_price)
            : existingCoffin[0].exact_price;
        const currentCurrency = currency || existingCoffin[0].currency;

        if (currentCurrency === 'USD') {
          updateFields.price_usd = currentPrice;
          updateFields.exact_price = currentPrice * EXCHANGE_RATES.USD;
        } else {
          updateFields.exact_price = currentPrice;
          updateFields.price_usd = currentPrice / EXCHANGE_RATES.USD;
        }
        updateFields.exchange_rate = EXCHANGE_RATES.USD;
        updateFields.currency = currentCurrency;
      }

      // Build dynamic update query
      const updateFieldsSql = [];
      const updateValues = [];

      if (type !== undefined) {
        updateFieldsSql.push('type = ?');
        updateValues.push(type.trim());
      }
      if (material !== undefined) {
        updateFieldsSql.push('material = ?');
        updateValues.push(material.trim());
      }
      if (exact_price !== undefined) {
        updateFieldsSql.push('exact_price = ?');
        updateValues.push(updateFields.exact_price);
      }
      if (currency !== undefined) {
        updateFieldsSql.push('currency = ?');
        updateValues.push(updateFields.currency);
      }
      if (updateFields.price_usd !== undefined) {
        updateFieldsSql.push('price_usd = ?');
        updateValues.push(updateFields.price_usd);
      }
      if (updateFields.exchange_rate !== undefined) {
        updateFieldsSql.push('exchange_rate = ?');
        updateValues.push(updateFields.exchange_rate);
      }
      if (quantity !== undefined) {
        updateFieldsSql.push('quantity = ?');
        updateValues.push(parseInt(quantity));
      }
      if (supplier !== undefined) {
        updateFieldsSql.push('supplier = ?');
        updateValues.push(supplier ? supplier.trim() : null);
      }
      if (origin !== undefined) {
        updateFieldsSql.push('origin = ?');
        updateValues.push(origin ? origin.trim() : null);
      }
      if (color !== undefined) {
        updateFieldsSql.push('color = ?');
        updateValues.push(color ? color.trim() : null);
      }
      if (size !== undefined) {
        updateFieldsSql.push('size = ?');
        updateValues.push(size ? size.trim() : null);
      }
      if (category !== undefined) {
        updateFieldsSql.push('category = ?');
        updateValues.push(category);
      }

      updateFieldsSql.push('updated_at = NOW()');
      updateValues.push(parseInt(id));

      if (updateFieldsSql.length > 0) {
        const updateSql = `
          UPDATE coffins 
          SET ${updateFieldsSql.join(', ')}
          WHERE coffin_id = ?
        `;

        await safeQuery(updateSql, updateValues);
      }

      await connection.commit();

      // Clear relevant caches
      coffinCache.del('allCoffins');
      coffinCache.del(`coffin_${id}`);
      coffinCache.del('coffinAnalytics');

      res.status(200).json({
        success: true,
        message: '✅ Coffin updated successfully',
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    console.error('❌ Error updating coffin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update coffin',
      error: error.message,
    });
  } finally {
    if (connection) {
      await releaseConnection(connection);
    }
    if (global.gc) global.gc();
  }
});

/* ===============================
   ✅ DELETE COFFIN (MEMORY SAFE)
   =============================== */

const deleteCoffin = expressAsyncHandler(async (req, res) => {
  let connection;

  try {
    const { id } = req.params;

    // Validate coffin ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coffin ID',
      });
    }

    const coffinId = parseInt(id);

    // Check if coffin exists
    const coffin = await safeQuery(
      'SELECT * FROM coffins WHERE coffin_id = ?',
      [coffinId],
    );

    if (coffin.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Coffin not found',
      });
    }

    // Prevent deletion if stock remains
    if (coffin[0].quantity > 0) {
      return res.status(400).json({
        success: false,
        message:
          'Cannot delete coffin with remaining stock. Please set quantity to 0 first.',
      });
    }

    // Prevent deletion if assigned to deceased
    const assignments = await safeQuery(
      'SELECT * FROM deceased_coffin WHERE coffin_id = ?',
      [coffinId],
    );

    if (assignments.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete coffin that is assigned to deceased persons',
      });
    }

    connection = await getConnection();

    try {
      await connection.beginTransaction();

      // Delete coffin images in batches
      const images = await safeQuery(
        'SELECT image_id FROM coffin_images WHERE coffin_id = ?',
        [coffinId],
      );

      if (images.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < images.length; i += batchSize) {
          const batch = images.slice(i, i + batchSize);
          const placeholders = batch.map(() => '?').join(','); // create ?,?,?
          const imageIds = batch.map((img) => img.image_id);

          await safeQuery(
            `DELETE FROM coffin_images WHERE image_id IN (${placeholders})`,
            imageIds,
          );
        }
      }

      // Delete coffin
      await safeQuery('DELETE FROM coffins WHERE coffin_id = ?', [coffinId]);

      await connection.commit();

      // Clear caches
      coffinCache.del('allCoffins');
      coffinCache.del(`coffin_${coffinId}`);
      coffinCache.del('coffinAnalytics');

      res.status(200).json({
        success: true,
        message: '✅ Coffin deleted successfully',
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    console.error('❌ Error deleting coffin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete coffin',
      error: error.message,
    });
  } finally {
    if (connection) await releaseConnection(connection);
    if (global.gc) global.gc();
  }
});

const exportCoffinsToExcel = expressAsyncHandler(async (req, res) => {
  try {
    const coffins = await safeQuery(`
      SELECT 
        c.coffin_id, c.custom_id, c.type, c.material, c.exact_price, c.currency,
        c.price_usd, c.quantity, c.supplier, c.origin, c.color, c.size, 
        c.category, c.created_at,
        u.name as created_by_name
      FROM coffins c
      LEFT JOIN users u ON c.created_by = u.id
      ORDER BY c.created_at DESC
      LIMIT 5000
    `);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Lee Funeral Home - MMS';
    workbook.lastModifiedBy = 'Lee Funeral Home Management System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet('Coffin Inventory', {
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.3,
          right: 0.3,
          top: 0.5,
          bottom: 0.5,
          header: 0.3,
          footer: 0.3,
        },
      },
      views: [{ state: 'normal' }],
    });

    // ======= CALCULATIONS =======
    const totalValuation = coffins.reduce(
      (sum, c) => sum + parseFloat(c.exact_price || 0) * (c.quantity || 0),
      0,
    );
    const totalStock = coffins.reduce((sum, c) => sum + (c.quantity || 0), 0);
    const lowStockCount = coffins.filter(
      (c) => c.quantity > 0 && c.quantity < 5,
    ).length;
    const outOfStockCount = coffins.filter((c) => c.quantity === 0).length;
    const uniqueModels = [...new Set(coffins.map((c) => c.type))].length;
    const generationTimestamp = new Date();
    const formattedTimestamp =
      generationTimestamp.toISOString().replace(/[:.]/g, '-').split('T')[0] +
      '_' +
      generationTimestamp.toTimeString().split(' ')[0].replace(/:/g, '-');

    // ======= ENHANCED HEADER SECTION WITH RICH TEXT =======
    const mainTitleRow = worksheet.addRow([]);
    worksheet.mergeCells(`A${mainTitleRow.number}:O${mainTitleRow.number}`);
    mainTitleRow.height = 45;

    // Create rich text for main title
    mainTitleRow.getCell(1).value = {
      richText: [
        {
          font: {
            size: 28,
            bold: true,
            color: { argb: 'FFFFFFFF' },
            name: 'Arial',
          },
          text: 'LEE FUNERAL HOME',
        },
        {
          font: {
            size: 20,
            color: { argb: 'FFFF6B35' },
            name: 'Arial',
          },
          text: ' - COFFIN INVENTORY',
        },
      ],
    };
    mainTitleRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1a202c' },
    };
    mainTitleRow.getCell(1).alignment = {
      vertical: 'middle',
      horizontal: 'center',
    };

    // System Info with Rich Text
    const systemRow = worksheet.addRow([]);
    worksheet.mergeCells(`A${systemRow.number}:O${systemRow.number}`);
    systemRow.height = 28;

    systemRow.getCell(1).value = {
      richText: [
        {
          font: {
            size: 14,
            bold: true,
            color: { argb: 'FFFFFFFF' },
            name: 'Arial',
          },
          text: 'MANAGEMENT SYSTEM (MMS)',
        },
        {
          font: {
            size: 12,
            color: { argb: 'FFECF0F1' },
            name: 'Arial',
          },
          text: ' | Generated: ',
        },
        {
          font: {
            size: 12,
            bold: true,
            color: { argb: 'FFFFD700' },
            name: 'Arial',
          },
          text: generationTimestamp.toLocaleString(),
        },
      ],
    };
    systemRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF5C01' },
    };
    systemRow.getCell(1).alignment = {
      vertical: 'middle',
      horizontal: 'center',
    };

    worksheet.addRow([]);

    // ======= ENHANCED SUMMARY SECTION =======
    const summaryHeader = worksheet.addRow(['INVENTORY OVERVIEW']);
    worksheet.mergeCells(`A${summaryHeader.number}:O${summaryHeader.number}`);
    summaryHeader.height = 32;
    summaryHeader.getCell(1).font = {
      name: 'Arial',
      size: 18,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    summaryHeader.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF126F80' },
    };
    summaryHeader.getCell(1).alignment = {
      vertical: 'middle',
      horizontal: 'center',
    };

    // Enhanced Summary Stats with better layout
    const summaryStats = [
      {
        label: 'TOTAL COFFINS IN STOCK',
        value: totalStock.toLocaleString(),
        color: 'FF38A169',
        bgColor: 'FFD5F5E3',
      },
      {
        label: 'TOTAL VALUATION',
        value: `Ksh ${totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        color: 'FF27AE60',
        bgColor: 'FFE8F6F3',
      },
      {
        label: 'UNIQUE MODELS',
        value: uniqueModels.toLocaleString(),
        color: 'FF2980B9',
        bgColor: 'FFEBF5FB',
      },
      {
        label: 'LOW STOCK (<5)',
        value: lowStockCount.toLocaleString(),
        color: 'FFFF6B35',
        bgColor: 'FFFDEBD0',
      },
      {
        label: 'OUT OF STOCK',
        value: outOfStockCount.toLocaleString(),
        color: 'FFE53E3E',
        bgColor: 'FFFDEDEC',
      },
    ];

    // Create summary in a single row with better spacing
    const summaryRow = worksheet.addRow([]);
    summaryRow.height = 35;

    summaryStats.forEach((stat, index) => {
      const startCol = index * 3 + 1;
      const endCol = startCol + 2;

      // Merge cells for each stat
      worksheet.mergeCells(
        `${String.fromCharCode(64 + startCol)}${summaryRow.number}:${String.fromCharCode(64 + endCol)}${summaryRow.number}`,
      );

      // Create rich text for each stat
      summaryRow.getCell(startCol).value = {
        richText: [
          {
            font: {
              size: 10,
              bold: true,
              color: { argb: 'FF1a202c' },
              name: 'Arial',
            },
            text: stat.label + '\n',
          },
          {
            font: {
              size: 14,
              bold: true,
              color: { argb: stat.color },
              name: 'Arial',
            },
            text: stat.value,
          },
        ],
      };

      summaryRow.getCell(startCol).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: stat.bgColor },
      };
      summaryRow.getCell(startCol).alignment = {
        horizontal: 'center',
        vertical: 'center',
        wrapText: true,
      };
      summaryRow.getCell(startCol).border = {
        top: { style: 'thin', color: { argb: 'FFBDC3C7' } },
        left: { style: 'thin', color: { argb: 'FFBDC3C7' } },
        bottom: { style: 'thin', color: { argb: 'FFBDC3C7' } },
        right: { style: 'thin', color: { argb: 'FFBDC3C7' } },
      };
    });

    worksheet.addRow([]);
    worksheet.addRow([]);

    // ======= ENHANCED DATA TABLE HEADERS =======
    const headers = [
      'SYS ID',
      'CUSTOM ID',
      'MODEL TYPE',
      'MATERIAL',
      'CATEGORY',
      'PRICE (KES)',
      'PRICE (USD)',
      'CURRENCY',
      'QUANTITY',
      'STOCK STATUS',
      'SUPPLIER',
      'ORIGIN',
      'COLOR',
      'SIZE',
      'CREATED DATE',
    ];

    const headerRow = worksheet.addRow(headers);
    headerRow.height = 30;

    headerRow.eachCell((cell) => {
      cell.font = {
        name: 'Arial',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1a202c' },
      };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FFBDC3C7' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FFBDC3C7' } },
      };
    });

    // ======= ENHANCED DATA ROWS WITH ALL FEATURES =======
    coffins.forEach((coffin, index) => {
      // Enhanced stock status with new thresholds
      let stockStatus, statusColor, statusBgColor;
      const quantity = coffin.quantity || 0;

      if (quantity === 0) {
        stockStatus = 'OUT OF STOCK';
        statusColor = 'FFFFFFFF';
        statusBgColor = 'FFE53E3E'; // dangerRed
      } else if (quantity < 5) {
        stockStatus = 'LOW STOCK';
        statusColor = 'FFFFFFFF';
        statusBgColor = 'FFFF6B35'; // accentOrange
      } else if (quantity < 10) {
        stockStatus = 'MODERATE';
        statusColor = 'FF1a202c';
        statusBgColor = 'FFFFF2CC'; // Light yellow
      } else {
        stockStatus = 'GOOD STOCK';
        statusColor = 'FF1a202c';
        statusBgColor = 'FFD5F5E3'; // Light green
      }

      // Format created date with full datetime if available
      let createdDate = 'N/A';
      if (coffin.created_at) {
        const created = new Date(coffin.created_at);
        createdDate = created.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }

      const row = worksheet.addRow([
        coffin.coffin_id, // SYS ID
        coffin.custom_id || 'N/A',
        coffin.type || 'N/A',
        coffin.material || 'N/A',
        coffin.category === 'locally_made' ? 'LOCAL' : 'IMPORTED',
        coffin.exact_price?.toLocaleString('en-US', {
          minimumFractionDigits: 2,
        }) || '0.00',
        coffin.price_usd?.toLocaleString('en-US', {
          minimumFractionDigits: 2,
        }) || '0.00',
        coffin.currency || 'KES',
        quantity,
        stockStatus,
        coffin.supplier || 'N/A',
        coffin.origin || 'N/A',
        coffin.color || 'N/A',
        coffin.size || 'STANDARD',
        createdDate,
      ]);

      row.height = 22;

      // Apply alternating row backgrounds with spacing effect
      let rowBgColor;
      if (Math.floor(index / 5) % 2 === 0) {
        // Every 5 rows, alternate the background
        rowBgColor = index % 10 < 5 ? 'FFFFFFFF' : 'FFF8F9F9';
      } else {
        rowBgColor = index % 10 < 5 ? 'FFF8F9F9' : 'FFFFFFFF';
      }

      row.eachCell((cell, colNumber) => {
        // Base cell styling
        cell.font = {
          name: 'Arial',
          size: 10,
          color: { argb: 'FF1a202c' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFBDC3C7' } },
          left: { style: 'thin', color: { argb: 'FFBDC3C7' } },
          bottom: { style: 'thin', color: { argb: 'FFBDC3C7' } },
          right: { style: 'thin', color: { argb: 'FFBDC3C7' } },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal:
            colNumber === 6 || colNumber === 7 || colNumber === 9
              ? 'right'
              : 'left',
        };

        // Base background
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBgColor },
        };

        // Special column styling
        switch (colNumber) {
          case 1: // SYS ID
            cell.font.bold = true;
            cell.font.color = { argb: 'FF126F80' };
            break;

          case 6: // Price KES
            cell.font = {
              name: 'Arial',
              size: 11,
              bold: true,
              color: { argb: 'FF38A169' },
            };
            // Highlight expensive coffins (> 500,000 KES)
            if (parseFloat(coffin.exact_price || 0) > 500000) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFF2CC' }, // Light yellow background
              };
              cell.font.color = { argb: 'FFB8860B' }; // Dark yellow text
            }
            break;

          case 7: // Price USD
            cell.font = {
              name: 'Arial',
              size: 11,
              bold: true,
              color: { argb: 'FF126F80' },
            };
            break;

          case 5: // Category
            cell.font.bold = true;
            cell.font.color = {
              argb:
                coffin.category === 'locally_made' ? 'FF38A169' : 'FF126F80',
            };
            break;

          case 9: // Quantity - Enhanced styling with new thresholds
            cell.font = {
              name: 'Arial',
              size: 11,
              bold: true,
              color: { argb: statusColor },
            };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: statusBgColor },
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            break;

          case 10: // Stock Status - Enhanced styling
            cell.font = {
              name: 'Arial',
              size: 10,
              bold: true,
              color: { argb: statusColor },
            };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: statusBgColor },
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            break;
        }
      });

      // Add empty row after every 5 rows for better readability
      if ((index + 1) % 5 === 0 && index < coffins.length - 1) {
        const spacerRow = worksheet.addRow([]);
        spacerRow.height = 8;
        spacerRow.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFECF0F1' }, // Light gray background for spacer
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFECF0F1' } },
            bottom: { style: 'thin', color: { argb: 'FFECF0F1' } },
          };
        });
      }
    });

    // ======= COLUMN WIDTHS =======
    worksheet.columns = [
      { width: 10 }, // SYS ID
      { width: 15 }, // CUSTOM ID
      { width: 22 }, // MODEL TYPE
      { width: 18 }, // MATERIAL
      { width: 12 }, // CATEGORY
      { width: 15 }, // PRICE (KES)
      { width: 15 }, // PRICE (USD)
      { width: 10 }, // CURRENCY
      { width: 12 }, // QUANTITY
      { width: 14 }, // STOCK STATUS
      { width: 20 }, // SUPPLIER
      { width: 18 }, // ORIGIN
      { width: 12 }, // COLOR
      { width: 12 }, // SIZE
      { width: 18 }, // CREATED DATE
    ];

    // ======= ENHANCED FOOTER SECTION =======
    worksheet.addRow([]);
    worksheet.addRow([]);

    // Final Summary with Rich Text
    const finalSummaryRow = worksheet.addRow([]);
    finalSummaryRow.height = 40;

    finalSummaryRow.getCell(1).value = {
      richText: [
        {
          font: {
            size: 16,
            bold: true,
            color: { argb: 'FFFFFFFF' },
            name: 'Arial',
          },
          text: 'TOTAL INVENTORY VALUATION: ',
        },
        {
          font: {
            size: 18,
            bold: true,
            color: { argb: 'FFFFD700' },
            name: 'Arial',
          },
          text: `Ksh ${totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        },
      ],
    };
    finalSummaryRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1a202c' },
    };
    finalSummaryRow.getCell(1).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.mergeCells(
      `A${finalSummaryRow.number}:O${finalSummaryRow.number}`,
    );

    // Footer Information with Rich Text
    worksheet.addRow([]);

    const footerInfoRow = worksheet.addRow([]);
    worksheet.mergeCells(`A${footerInfoRow.number}:O${footerInfoRow.number}`);

    footerInfoRow.getCell(1).value = {
      richText: [
        {
          font: {
            size: 10,
            color: { argb: 'FF7F8C8D' },
            name: 'Arial',
          },
          text: 'Lee Funeral Home Management System (MMS) | ',
        },
        {
          font: {
            size: 10,
            bold: true,
            color: { argb: 'FF126F80' },
            name: 'Arial',
          },
          text: 'Generated: ',
        },
        {
          font: {
            size: 10,
            color: { argb: 'FF7F8C8D' },
            name: 'Arial',
          },
          text: generationTimestamp.toLocaleString(),
        },
      ],
    };
    footerInfoRow.getCell(1).alignment = {
      horizontal: 'center',
    };

    const copyrightRow = worksheet.addRow([]);
    worksheet.mergeCells(`A${copyrightRow.number}:O${copyrightRow.number}`);

    copyrightRow.getCell(1).value = {
      richText: [
        {
          font: {
            size: 9,
            italic: true,
            color: { argb: 'FF95A5A6' },
            name: 'Arial',
          },
          text:
            '© ' + generationTimestamp.getFullYear() + ' Lee Funeral Home. ',
        },
        {
          font: {
            size: 9,
            italic: true,
            color: { argb: 'FFE74C3C' },
            name: 'Arial',
          },
          text: 'CONFIDENTIAL',
        },
        {
          font: {
            size: 9,
            italic: true,
            color: { argb: 'FF95A5A6' },
            name: 'Arial',
          },
          text: ' - For internal use only.',
        },
      ],
    };
    copyrightRow.getCell(1).alignment = {
      horizontal: 'center',
    };

    // ======= SEND EXCEL FILE WITH ENHANCED FILENAME =======
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Lee-Funeral-Coffin-Inventory-${formattedTimestamp}.xlsx"`,
    );
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('❌ Error exporting to Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export data to Excel',
      error: error.message,
    });
  }
});

/* ===============================
   ✅ ASSIGN COFFIN (MEMORY SAFE)
   =============================== */
const assignCoffin = expressAsyncHandler(async (req, res) => {
  let connection;

  try {
    const {
      deceased_id,
      coffin_id,
      assigned_by,
      assigned_date,
      deceased_name,
    } = req.body;

    if (!deceased_id || !coffin_id || !deceased_name) {
      return res.status(400).json({
        success: false,
        message:
          'Missing required fields: deceased_id, coffin_id, deceased_name are required.',
      });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // Lock coffin row
    const [coffin] = await safeQuery(
      'SELECT quantity, type, material FROM coffins WHERE coffin_id = ? FOR UPDATE',
      [coffin_id],
    );

    if (!coffin) {
      await connection.rollback();
      return res
        .status(404)
        .json({ success: false, message: 'Coffin not found' });
    }

    if (coffin.quantity <= 0) {
      await connection.rollback();
      return res
        .status(400)
        .json({ success: false, message: 'Coffin out of stock' });
    }

    // Use provided username or default to 'system'
    const username = assigned_by || 'system';

    const finalAssignedDate =
      assigned_date && !isNaN(Date.parse(assigned_date))
        ? assigned_date
        : new Date().toISOString().split('T')[0];

    const rfid = generateRFID(deceased_name);

    // Insert assignment
    const insertSql = `
      INSERT INTO deceased_coffin (deceased_id, coffin_id, assigned_by_username, assigned_date, rfid)
      VALUES (?, ?, ?, ?, ?)
    `;
    const result = await safeQuery(insertSql, [
      deceased_id,
      coffin_id,
      username,
      finalAssignedDate,
      rfid,
    ]);

    // Update coffin stock
    await safeQuery(
      'UPDATE coffins SET quantity = quantity - 1, updated_at = NOW() WHERE coffin_id = ?',
      [coffin_id],
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: '✅ Coffin assigned successfully',
      assignment_id: result.insertId,
      rfid,
      coffin_details: { type: coffin.type, material: coffin.material },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('❌ Error assigning coffin:', error);
    res.status(500).json({
      success: false,
      message: 'Database error during assignment',
      error: error.message,
    });
  } finally {
    if (connection) connection.release();
    if (global.gc) global.gc();
  }
});

/* ===============================
   ✅ GET RECENTLY ASSIGNED COFFINS (MEMORY SAFE)
   =============================== */
const getRecentlyAssignedCoffins = expressAsyncHandler(async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 10, 100); // Cap at 100

    const cacheKey = `recent_assignments_${safeLimit}`;
    let assignments = coffinCache.get(cacheKey);

    if (!assignments) {
      const sql = `
        SELECT 
          dc.id AS assignment_id,
          dc.deceased_id,
          d.full_name AS deceased_name,
          dc.assigned_date,
          dc.rfid,
          c.coffin_id,
          c.type AS coffin_type,
          c.material,
          c.color,
          c.size
        FROM deceased_coffin dc
        LEFT JOIN deceased d ON dc.deceased_id = d.deceased_id
        LEFT JOIN coffins c ON dc.coffin_id = c.coffin_id
        ORDER BY dc.assigned_date DESC, dc.created_at DESC
        LIMIT ?
      `;

      assignments = await safeQuery(sql, [safeLimit]);
      coffinCache.set(cacheKey, assignments, 60); // Cache for 1 minute
    }

    res.status(200).json({
      success: true,
      data: assignments,
      count: assignments.length,
      message:
        assignments.length === 0
          ? 'No recent assignments found'
          : 'Recent assignments fetched successfully',
    });
  } catch (error) {
    console.error('❌ Error fetching recent assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent assignments',
      error: error.message,
    });
  } finally {
    if (global.gc) global.gc();
  }
});

/* ===============================
   ✅ COFFIN ANALYTICS DASHBOARD (MEMORY SAFE)
   =============================== */

const getCoffinAnalytics = expressAsyncHandler(async (req, res) => {
  try {
    const generationTimestamp = new Date();

    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const day = generationTimestamp.getDate();
    const month = monthNames[generationTimestamp.getMonth()]; // getMonth() returns 0-11
    const year = generationTimestamp.getFullYear();

    // Optional: include user or report type
    const username = req.user?.username || 'System';

    // Build the filename
    const filename = `Lee-Funeral-Coffin-Inventory-${month}-${day}-${year}.xlsx`;

    // Check cache first
    let analytics = coffinCache.get('coffinAnalytics');

    if (!analytics) {
      const [overview] = await safeQuery(`
        SELECT 
          COUNT(*) AS total_coffins,
          SUM(quantity) AS total_in_stock,
          SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) AS out_of_stock_count,
          SUM(CASE WHEN quantity > 0 THEN 1 ELSE 0 END) AS available_types,
          SUM(exact_price * quantity) AS total_inventory_value,
          COUNT(DISTINCT type) as unique_types,
          COUNT(DISTINCT material) as unique_materials
        FROM coffins
      `);

      // Get analytics in chunks to prevent memory issues
      const [typeBreakdown] = await safeQuery(`
        SELECT 
          type,
          COUNT(*) AS total_models,
          SUM(quantity) AS total_stock,
          SUM(exact_price * quantity) AS total_value
        FROM coffins
        GROUP BY type
        ORDER BY total_stock DESC
        LIMIT 20
      `);

      const [materialBreakdown] = await safeQuery(`
        SELECT 
          material,
          COUNT(*) AS total_models,
          SUM(quantity) AS total_stock,
          SUM(exact_price * quantity) AS total_value
        FROM coffins
        GROUP BY material
        ORDER BY total_value DESC
        LIMIT 20
      `);

      const [categoryBreakdown] = await safeQuery(`
        SELECT 
          category,
          COUNT(*) as count,
          SUM(quantity) as total_stock,
          SUM(exact_price * quantity) as total_value
        FROM coffins
        GROUP BY category
      `);

      const recentAssignments = await safeQuery(`
        SELECT 
          dc.id AS assignment_id,
          dc.deceased_id,
          d.full_name AS deceased_name,
          dc.assigned_date,
          c.type AS coffin_type,
          c.material,
          u.name AS assigned_by
        FROM deceased_coffin dc
        LEFT JOIN deceased d ON dc.deceased_id = d.deceased_id
        LEFT JOIN coffins c ON dc.coffin_id = c.coffin_id
        LEFT JOIN users u ON dc.assigned_by = u.id
        ORDER BY dc.assigned_date DESC
        LIMIT 5
      `);

      analytics = {
        overview: {
          total_coffins: overview.total_coffins || 0,
          total_in_stock: overview.total_in_stock || 0,
          out_of_stock_count: overview.out_of_stock_count || 0,
          available_types: overview.available_types || 0,
          unique_types: overview.unique_types || 0,
          unique_materials: overview.unique_materials || 0,
          total_inventory_value: parseFloat(
            overview.total_inventory_value || 0,
          ).toFixed(2),
        },
        by_type: typeBreakdown,
        by_material: materialBreakdown,
        by_category: categoryBreakdown,
        recent_assignments: recentAssignments,
        last_updated: new Date().toISOString(),
      };

      // Cache for 5 mins
      coffinCache.set('coffinAnalytics', analytics, 300);
    }

    res.status(200).json({
      success: true,
      message: `✅ Coffin analytics fetched successfully for ${month} ${day}, ${year}`,
      filename, // return the proper filename
      data: analytics,
      generatedAt: generationTimestamp.toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching coffin analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coffin analytics',
      error: error.message,
    });
  } finally {
    if (global.gc) global.gc();
  }
});

/* ===============================
   ✅ HEALTH CHECK ENDPOINT
   =============================== */
const healthCheck = expressAsyncHandler(async (req, res) => {
  try {
    // Check database connection
    await safeQuery('SELECT 1');

    // Check cache health
    const cacheStats = coffinCache.getStats();

    res.status(200).json({
      success: true,
      message: '✅ Service is healthy',
      data: {
        timestamp: new Date().toISOString(),
        database: 'connected',
        cache: {
          hits: cacheStats.hits,
          misses: cacheStats.misses,
          keys: cacheStats.keys,
          memory_usage: process.memoryUsage(),
        },
      },
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(503).json({
      success: false,
      message: 'Service unhealthy',
      error: error.message,
    });
  }
});

/* ===============================
   ✅ MEMORY USAGE ENDPOINT (FOR MONITORING)
   =============================== */
const getMemoryUsage = expressAsyncHandler(async (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const cacheStats = coffinCache.getStats();

    res.status(200).json({
      success: true,
      data: {
        memory: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
        },
        cache: {
          keys: cacheStats.keys,
          hits: cacheStats.hits,
          misses: cacheStats.misses,
          hitRate:
            cacheStats.keys > 0
              ? (
                  (cacheStats.hits / (cacheStats.hits + cacheStats.misses)) *
                  100
                ).toFixed(2) + '%'
              : '0%',
        },
        uptime: `${Math.round(process.uptime())} seconds`,
      },
    });
  } catch (error) {
    console.error('❌ Error getting memory usage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get memory usage',
    });
  }
});

// Export cleanup function for manual invocation
const manualCleanup = () => {
  cleanupResources();
};

module.exports = {
  createCoffin,
  getAllCoffins,
  getCoffinById,
  updateCoffin,
  deleteCoffin,
  assignCoffin,
  getRecentlyAssignedCoffins,
  getCoffinAnalytics,
  exportCoffinsToExcel,
  healthCheck,
  getMemoryUsage,
  manualCleanup,
};
