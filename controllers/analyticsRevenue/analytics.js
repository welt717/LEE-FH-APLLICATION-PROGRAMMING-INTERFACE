const asyncHandler = require('express-async-handler');
const {
  safeQuery,
  safeQueryOne,
} = require('../../configurations/sqlConfig/db');

// === Advanced Analytics Controller ===
const getMortuaryAnalytics = asyncHandler(async (req, res) => {
  try {
    console.log('🔄 Fetching comprehensive mortuary analytics...');

    // Set response headers for streaming
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Initialize response structure
    const responseData = {
      success: true,
      message: 'Mortuary analytics data retrieved successfully',
      data: {
        summary: {},
        caseStatus: {},
        revenue: { total: {}, extraServices: {} },
        serviceTypes: {},
        paymentFrequency: {},
        monthlyTrends: {},
        visitorTrends: {},
        coffinSales: [],
        averageStayDuration: {},
        hearseDistance: {},
        revenueMeta: { currency: 'KES' },
        // New advanced analytics
        dispatchAnalytics: {},
        coffinInventory: {},
        operationalMetrics: {},
        financialMetrics: {},
        performanceIndicators: {},
      },
    };

    // Execute queries in parallel with individual error handling
    const queries = [
      // 1. Basic Summary Statistics
      executeQuery(
        `
        SELECT 
          COUNT(*) as total_cases,
          COUNT(CASE WHEN status = 'Released' THEN 1 END) as released_cases,
          COUNT(CASE WHEN status = 'Under Care' THEN 1 END) as under_care_cases,
          COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_cases,
          COUNT(CASE WHEN status = 'Received' THEN 1 END) as received_cases,
          COALESCE(SUM(total_mortuary_charge), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN status = 'Released' THEN total_mortuary_charge ELSE 0 END), 0) as collected_revenue,
          COALESCE(SUM(COALESCE(embalming_cost, 0)), 0) as embalming_revenue,
          COUNT(CASE WHEN burial_type = 'Burial' THEN 1 END) as burial_cases,
          COUNT(CASE WHEN burial_type = 'Cremation' THEN 1 END) as cremation_cases,
          COUNT(CASE WHEN burial_type = 'Other' THEN 1 END) as other_cases,
          COALESCE(AVG(CASE WHEN dispatch_date IS NOT NULL THEN DATEDIFF(COALESCE(dispatch_date, CURDATE()), date_admitted) END), 0) as avg_stay_duration,
          COUNT(CASE WHEN is_embalmed = 1 THEN 1 END) as embalmed_cases,
          COUNT(CASE WHEN rate_category = 'premium' THEN 1 END) as premium_cases,
          COUNT(CASE WHEN rate_category = 'standard' THEN 1 END) as standard_cases,
          COUNT(CASE WHEN rate_category = 'basic' THEN 1 END) as basic_cases,
          COALESCE(SUM(CASE WHEN MONTH(date_admitted) = MONTH(CURDATE()) AND YEAR(date_admitted) = YEAR(CURDATE()) THEN total_mortuary_charge ELSE 0 END), 0) as current_month_revenue,
          COALESCE(AVG(CASE WHEN status = 'Released' AND dispatch_date IS NOT NULL THEN DATEDIFF(dispatch_date, date_admitted) END), 0) as avg_processing_time,
          -- New metrics
          COUNT(CASE WHEN DATEDIFF(CURDATE(), date_admitted) > 30 THEN 1 END) as long_stay_cases,
          COUNT(CASE WHEN balance > 0 THEN 1 END) as pending_payments,
          COALESCE(SUM(balance), 0) as total_outstanding
        FROM deceased
      `,
        [],
        'summary_stats',
      ),

      // 2. Visitor Statistics
      executeQuery(
        `
        SELECT 
          COUNT(CASE WHEN DATE(check_in_time) = CURDATE() THEN 1 END) as today_visitors,
          COUNT(CASE WHEN WEEK(check_in_time) = WEEK(CURDATE()) THEN 1 END) as weekly_visitors,
          COUNT(CASE WHEN MONTH(check_in_time) = MONTH(CURDATE()) THEN 1 END) as monthly_visitors,
          COALESCE(AVG(TIMESTAMPDIFF(HOUR, check_in_time, COALESCE(check_out_time, NOW()))), 0) as avg_visit_duration
        FROM visitors
      `,
        [],
        'visitor_stats',
      ),

      // 3. Coffin Sales & Inventory
      executeQuery(
        `
        SELECT 
          c.coffin_id,
          c.type as name,
          c.material,
          c.category,
          COUNT(dc.coffin_id) as sold,
          COALESCE(c.exact_price, 0) as price,
          COALESCE(c.quantity, 0) as stock,
          c.image_url as image,
          c.status,
          c.supplier,
          (COALESCE(c.quantity, 0) - COUNT(dc.coffin_id)) as available_stock,
          (COUNT(dc.coffin_id) * COALESCE(c.exact_price, 0)) as total_revenue
        FROM coffins c
        LEFT JOIN deceased_coffin dc ON c.coffin_id = dc.coffin_id
        GROUP BY c.coffin_id, c.type, c.material, c.category, c.exact_price, c.quantity, c.image_url, c.status, c.supplier
        ORDER BY sold DESC
        LIMIT 10
      `,
        [],
        'coffin_sales',
      ),

      // 4. Extra Services
      executeQuery(
        `
        SELECT 
          charge_type as service,
          COALESCE(SUM(amount), 0) as revenue,
          COUNT(*) as service_count,
          COALESCE(AVG(amount), 0) as avg_service_price
        FROM extra_charges ec
        JOIN deceased d ON ec.deceased_id = d.deceased_id
        GROUP BY charge_type
        ORDER BY revenue DESC
      `,
        [],
        'extra_services',
      ),

      // 5. Vehicle Dispatch Analytics
      executeQuery(
        `
        SELECT 
          COUNT(*) as total_dispatches,
          COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_dispatches,
          COUNT(CASE WHEN status = 'In Transit' THEN 1 END) as in_transit_dispatches,
          COUNT(CASE WHEN status = 'Assigned' THEN 1 END) as assigned_dispatches,
          COALESCE(SUM(distance_km), 0) as total_distance,
          COALESCE(SUM(round_trip_km), 0) as total_round_trip_distance,
          COALESCE(AVG(distance_km), 0) as avg_dispatch_distance,
          COUNT(DISTINCT vehicle_plate) as unique_vehicles,
          COUNT(DISTINCT driver_name) as unique_drivers,
          -- Weekly dispatches
          COUNT(CASE WHEN dispatch_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as weekly_dispatches,
          -- Monthly dispatches
          COUNT(CASE WHEN dispatch_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as monthly_dispatches
        FROM vehicle_dispatch
        WHERE dispatch_date IS NOT NULL
      `,
        [],
        'dispatch_stats',
      ),

      // 6. Dispatch Time Analysis
      executeQuery(
        `
        SELECT 
          HOUR(dispatch_time) as hour,
          COUNT(*) as dispatch_count,
          COALESCE(AVG(distance_km), 0) as avg_distance
        FROM vehicle_dispatch
        WHERE dispatch_time IS NOT NULL
        GROUP BY HOUR(dispatch_time)
        ORDER BY hour
      `,
        [],
        'dispatch_times',
      ),

      // 7. Monthly Revenue & Cases
      executeQuery(
        `
        SELECT 
          DATE_FORMAT(date_admitted, '%b %Y') as month,
          DATE_FORMAT(date_admitted, '%Y-%m') as month_key,
          COALESCE(SUM(total_mortuary_charge), 0) as revenue,
          COUNT(*) as cases,
          COALESCE(SUM(balance), 0) as outstanding,
          COALESCE(AVG(DATEDIFF(COALESCE(dispatch_date, CURDATE()), date_admitted)), 0) as avg_processing_days
        FROM deceased 
        WHERE date_admitted >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(date_admitted, '%Y-%m'), DATE_FORMAT(date_admitted, '%b %Y')
        ORDER BY DATE_FORMAT(date_admitted, '%Y-%m')
      `,
        [],
        'monthly_revenue',
      ),

      // 8. Weekly Patterns
      executeQuery(
        `
        SELECT 
          DAYNAME(date_admitted) as day,
          COUNT(*) as admissions,
          COALESCE(AVG(DATEDIFF(COALESCE(dispatch_date, CURDATE()), date_admitted)), 0) as avg_processing_days
        FROM deceased 
        WHERE date_admitted >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        GROUP BY DAYNAME(date_admitted)
        ORDER BY FIELD(day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
      `,
        [],
        'weekly_data',
      ),

      // 9. Coffin Inventory Status
      executeQuery(
        `
        SELECT 
          status,
          COUNT(*) as count,
          COALESCE(SUM(quantity), 0) as total_quantity,
          COALESCE(SUM(exact_price * quantity), 0) as total_value
        FROM coffins
        GROUP BY status
        ORDER BY total_value DESC
      `,
        [],
        'coffin_inventory',
      ),

      // 10. Top Performing Vehicles
      executeQuery(
        `
        SELECT 
          vehicle_plate,
          COUNT(*) as total_trips,
          COALESCE(SUM(distance_km), 0) as total_distance,
          COALESCE(SUM(round_trip_km), 0) as total_round_trip,
          COALESCE(AVG(distance_km), 0) as avg_trip_distance
        FROM vehicle_dispatch
        WHERE vehicle_plate IS NOT NULL AND vehicle_plate != ''
        GROUP BY vehicle_plate
        ORDER BY total_trips DESC
        LIMIT 5
      `,
        [],
        'vehicle_performance',
      ),

      // 11. Service Type Revenue Breakdown
      executeQuery(
        `
        SELECT 
          burial_type,
          COUNT(*) as case_count,
          COALESCE(SUM(total_mortuary_charge), 0) as total_revenue,
          COALESCE(AVG(total_mortuary_charge), 0) as avg_revenue_per_case,
          COALESCE(AVG(DATEDIFF(COALESCE(dispatch_date, CURDATE()), date_admitted)), 0) as avg_processing_days
        FROM deceased
        WHERE burial_type IS NOT NULL
        GROUP BY burial_type
        ORDER BY total_revenue DESC
      `,
        [],
        'service_revenue',
      ),

      // 12. Recent Activity (Last 7 days)
      executeQuery(
        `
        SELECT 
          'admissions' as activity_type,
          COUNT(*) as count
        FROM deceased 
        WHERE date_admitted >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        UNION ALL
        SELECT 
          'releases' as activity_type,
          COUNT(*) as count
        FROM deceased 
        WHERE dispatch_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND status = 'Released'
        UNION ALL
        SELECT 
          'visitors' as activity_type,
          COUNT(*) as count
        FROM visitors 
        WHERE DATE(check_in_time) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        UNION ALL
        SELECT 
          'dispatches' as activity_type,
          COUNT(*) as count
        FROM vehicle_dispatch 
        WHERE dispatch_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      `,
        [],
        'recent_activity',
      ),
    ];

    // Execute all queries and handle results
    const results = await Promise.allSettled(queries);

    // Process results with individual error handling
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { data, queryName } = result.value;
        await processQueryResult(data, queryName, responseData);
      } else {
        console.warn(
          `⚠️ Query failed but continuing: ${result.reason.queryName || 'Unknown query'}`,
          result.reason.error?.message,
        );
        applyFallbackData(result.reason.queryName, responseData);
      }
    }

    // Calculate derived metrics
    calculateDerivedMetrics(responseData);

    console.log('✅ Advanced analytics data prepared successfully');

    // Send final response
    res.status(200).json(responseData);
  } catch (error) {
    console.error('❌ Critical error in analytics controller:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics data',
      error: error.message,
      data: getFallbackDataStructure(),
    });
  }
});

// Helper function to execute queries with error handling
async function executeQuery(sql, params = [], queryName = 'unknown') {
  try {
    console.log(`📊 Executing query: ${queryName}`);
    const data = await safeQuery(sql, params);
    return { data, queryName };
  } catch (error) {
    console.error(`❌ Query ${queryName} failed:`, error.message);
    throw { error, queryName };
  }
}

// Safe number formatting function
function safeFormatNumber(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }
  const num = parseFloat(value);
  return parseFloat(num.toFixed(decimals));
}

// Safe percentage calculation
function safePercentage(numerator, denominator, decimals = 1) {
  if (
    !denominator ||
    denominator === 0 ||
    isNaN(numerator) ||
    isNaN(denominator)
  ) {
    return 0;
  }
  const percentage = (numerator / denominator) * 100;
  return parseFloat(percentage.toFixed(decimals));
}

// Process query results and update response data
async function processQueryResult(data, queryName, responseData) {
  try {
    switch (queryName) {
      case 'summary_stats':
        if (data && data[0]) {
          const stats = data[0];
          responseData.data.summary = {
            totalCases: parseInt(stats.total_cases) || 0,
            releasedCases: parseInt(stats.released_cases) || 0,
            underCareCases: parseInt(stats.under_care_cases) || 0,
            pendingCases: parseInt(stats.pending_cases) || 0,
            receivedCases: parseInt(stats.received_cases) || 0,
            avgProcessingTime: Math.round(
              parseFloat(stats.avg_processing_time) || 0,
            ),
            totalRevenue: parseFloat(stats.total_revenue) || 0,
            collectedRevenue: parseFloat(stats.collected_revenue) || 0,
            embalmingRevenue: parseFloat(stats.embalming_revenue) || 0,
            totalVisitors: 0, // Updated by visitor_stats
            extraServicesRevenue: 0, // Updated by extra_services
            avgStayDuration: safeFormatNumber(stats.avg_stay_duration),
            longStayCases: parseInt(stats.long_stay_cases) || 0,
            pendingPayments: parseInt(stats.pending_payments) || 0,
            totalOutstanding: parseFloat(stats.total_outstanding) || 0,
            currentMonthRevenue: parseFloat(stats.current_month_revenue) || 0,
          };

          responseData.data.caseStatus = {
            RECEIVED: parseInt(stats.received_cases) || 0,
            UNDER_CARE: parseInt(stats.under_care_cases) || 0,
            PENDING: parseInt(stats.pending_cases) || 0,
            COMPLETED: parseInt(stats.released_cases) || 0,
          };

          responseData.data.serviceTypes = {
            Burial: parseInt(stats.burial_cases) || 0,
            Cremation: parseInt(stats.cremation_cases) || 0,
            Other: parseInt(stats.other_cases) || 0,
          };

          responseData.data.paymentFrequency = {
            Premium: parseInt(stats.premium_cases) || 0,
            Standard: parseInt(stats.standard_cases) || 0,
            Basic: parseInt(stats.basic_cases) || 0,
          };
        }
        break;

      case 'visitor_stats':
        if (data && data[0]) {
          const stats = data[0];
          responseData.data.summary.totalVisitors =
            parseInt(stats.weekly_visitors) || 0;
          responseData.data.operationalMetrics = {
            ...responseData.data.operationalMetrics,
            todayVisitors: parseInt(stats.today_visitors) || 0,
            monthlyVisitors: parseInt(stats.monthly_visitors) || 0,
            avgVisitDuration: safeFormatNumber(stats.avg_visit_duration),
          };
        }
        break;

      case 'coffin_sales':
        responseData.data.coffinSales = data.map((coffin) => ({
          id: coffin.coffin_id,
          name: coffin.name || 'Unknown',
          material: coffin.material || 'N/A',
          category: coffin.category || 'standard',
          sold: parseInt(coffin.sold) || 0,
          price: parseFloat(coffin.price) || 0,
          stock: parseInt(coffin.stock) || 0,
          availableStock: parseInt(coffin.available_stock) || 0,
          image: coffin.image || null,
          status: coffin.status || 'in-stock',
          supplier: coffin.supplier || 'N/A',
          totalRevenue: parseFloat(coffin.total_revenue) || 0,
        }));
        break;

      case 'extra_services':
        const services = {};
        let totalExtraRevenue = 0;
        data.forEach((item) => {
          const revenue = parseFloat(item.revenue) || 0;
          services[item.service] = {
            revenue: revenue,
            count: parseInt(item.service_count) || 0,
            avgPrice: safeFormatNumber(item.avg_service_price, 2),
          };
          totalExtraRevenue += revenue;
        });
        responseData.data.revenue.extraServices = services;
        responseData.data.summary.extraServicesRevenue = totalExtraRevenue;
        break;

      case 'dispatch_stats':
        if (data && data[0]) {
          const stats = data[0];
          responseData.data.dispatchAnalytics = {
            totalDispatches: parseInt(stats.total_dispatches) || 0,
            completedDispatches: parseInt(stats.completed_dispatches) || 0,
            inTransitDispatches: parseInt(stats.in_transit_dispatches) || 0,
            assignedDispatches: parseInt(stats.assigned_dispatches) || 0,
            totalDistance: parseFloat(stats.total_distance) || 0,
            totalRoundTrip: parseFloat(stats.total_round_trip_distance) || 0,
            avgDispatchDistance: safeFormatNumber(stats.avg_dispatch_distance),
            uniqueVehicles: parseInt(stats.unique_vehicles) || 0,
            uniqueDrivers: parseInt(stats.unique_drivers) || 0,
            weeklyDispatches: parseInt(stats.weekly_dispatches) || 0,
            monthlyDispatches: parseInt(stats.monthly_dispatches) || 0,
            completionRate: safePercentage(
              parseInt(stats.completed_dispatches) || 0,
              parseInt(stats.total_dispatches) || 0,
            ),
          };
        }
        break;

      case 'dispatch_times':
        const dispatchPattern = {};
        data.forEach((item) => {
          dispatchPattern[item.hour] = {
            count: parseInt(item.dispatch_count) || 0,
            avgDistance: safeFormatNumber(item.avg_distance),
          };
        });
        responseData.data.dispatchAnalytics.hourlyPattern = dispatchPattern;
        break;

      case 'monthly_revenue':
        const revenueData = {};
        const caseData = {};
        const processingData = {};

        data.forEach((item) => {
          revenueData[item.month] = parseFloat(item.revenue) || 0;
          caseData[item.month] = parseInt(item.cases) || 0;
          processingData[item.month] = safeFormatNumber(
            item.avg_processing_days,
          );
        });

        responseData.data.revenue.total = revenueData;
        responseData.data.monthlyTrends = caseData;
        responseData.data.performanceIndicators.monthlyProcessingTime =
          processingData;
        break;

      case 'weekly_data':
        const weeklyPattern = {};
        const days = [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ];

        days.forEach((day) => {
          const found = data.find((item) => item.day === day);
          weeklyPattern[day] = {
            admissions: found ? parseInt(found.admissions) || 0 : 0,
            avgProcessingDays: found
              ? safeFormatNumber(found.avg_processing_days)
              : 0,
          };
        });

        responseData.data.visitorTrends = weeklyPattern;
        break;

      case 'coffin_inventory':
        const inventory = {};
        let totalInventoryValue = 0;

        data.forEach((item) => {
          const value = parseFloat(item.total_value) || 0;
          inventory[item.status] = {
            count: parseInt(item.count) || 0,
            quantity: parseInt(item.total_quantity) || 0,
            value: value,
          };
          totalInventoryValue += value;
        });

        responseData.data.coffinInventory = {
          status: inventory,
          totalValue: totalInventoryValue,
        };
        break;

      case 'vehicle_performance':
        responseData.data.dispatchAnalytics.topVehicles = data.map(
          (vehicle) => ({
            plate: vehicle.vehicle_plate || 'Unknown',
            trips: parseInt(vehicle.total_trips) || 0,
            totalDistance: parseFloat(vehicle.total_distance) || 0,
            totalRoundTrip: parseFloat(vehicle.total_round_trip) || 0,
            avgTripDistance: safeFormatNumber(vehicle.avg_trip_distance),
          }),
        );
        break;

      case 'service_revenue':
        const serviceMetrics = {};
        data.forEach((item) => {
          serviceMetrics[item.burial_type] = {
            caseCount: parseInt(item.case_count) || 0,
            totalRevenue: parseFloat(item.total_revenue) || 0,
            avgRevenue: safeFormatNumber(item.avg_revenue_per_case, 2),
            avgProcessingDays: safeFormatNumber(item.avg_processing_days),
          };
        });
        responseData.data.performanceIndicators.serviceMetrics = serviceMetrics;
        break;

      case 'recent_activity':
        const activity = {};
        data.forEach((item) => {
          activity[item.activity_type] = parseInt(item.count) || 0;
        });
        responseData.data.operationalMetrics.recentActivity = activity;
        break;
    }
  } catch (error) {
    console.error(`❌ Error processing query ${queryName}:`, error);
    applyFallbackData(queryName, responseData);
  }
}

// Calculate derived metrics
function calculateDerivedMetrics(responseData) {
  try {
    const summary = responseData.data.summary;
    const dispatch = responseData.data.dispatchAnalytics;

    // Financial Metrics
    responseData.data.financialMetrics = {
      collectionRate: safePercentage(
        summary.collectedRevenue,
        summary.totalRevenue,
      ),
      revenuePerCase:
        summary.totalCases > 0
          ? safeFormatNumber(summary.totalRevenue / summary.totalCases, 2)
          : 0,
      outstandingPercentage: safePercentage(
        summary.totalOutstanding,
        summary.totalRevenue,
      ),
    };

    // Operational Efficiency
    responseData.data.performanceIndicators = {
      ...responseData.data.performanceIndicators,
      caseCompletionRate: safePercentage(
        summary.releasedCases,
        summary.totalCases,
      ),
      longStayPercentage: safePercentage(
        summary.longStayCases,
        summary.totalCases,
      ),
      embalmingRate: safePercentage(
        summary.embalmingRevenue,
        summary.totalRevenue,
      ),
    };

    // Dispatch Efficiency
    if (dispatch) {
      responseData.data.performanceIndicators.dispatchEfficiency = {
        completionRate: parseFloat(dispatch.completionRate) || 0,
        avgTripsPerVehicle:
          dispatch.uniqueVehicles > 0
            ? safeFormatNumber(
                dispatch.totalDispatches / dispatch.uniqueVehicles,
              )
            : 0,
        utilizationRate: safeFormatNumber(dispatch.weeklyDispatches / 7 || 0),
      };
    }
  } catch (error) {
    console.error('❌ Error calculating derived metrics:', error);
  }
}

// Apply fallback data for failed queries
function applyFallbackData(queryName, responseData) {
  const fallbacks = {
    summary_stats: () => {
      responseData.data.summary = getFallbackDataStructure().summary;
      responseData.data.caseStatus = getFallbackDataStructure().caseStatus;
      responseData.data.serviceTypes = getFallbackDataStructure().serviceTypes;
      responseData.data.paymentFrequency =
        getFallbackDataStructure().paymentFrequency;
    },
    dispatch_stats: () => {
      responseData.data.dispatchAnalytics = {
        totalDispatches: 0,
        completedDispatches: 0,
        inTransitDispatches: 0,
        assignedDispatches: 0,
        totalDistance: 0,
        totalRoundTrip: 0,
        avgDispatchDistance: 0,
        uniqueVehicles: 0,
        uniqueDrivers: 0,
        weeklyDispatches: 0,
        monthlyDispatches: 0,
        completionRate: 0,
      };
    },
    coffin_inventory: () => {
      responseData.data.coffinInventory = {
        status: {},
        totalValue: 0,
      };
    },
    // ... other fallbacks remain similar
  };

  if (fallbacks[queryName]) {
    fallbacks[queryName]();
  }
}

// Complete fallback data structure
function getFallbackDataStructure() {
  return {
    summary: {
      totalCases: 0,
      releasedCases: 0,
      underCareCases: 0,
      pendingCases: 0,
      receivedCases: 0,
      avgProcessingTime: 0,
      totalRevenue: 0,
      collectedRevenue: 0,
      embalmingRevenue: 0,
      totalVisitors: 0,
      extraServicesRevenue: 0,
      avgStayDuration: 0,
      longStayCases: 0,
      pendingPayments: 0,
      totalOutstanding: 0,
      currentMonthRevenue: 0,
    },
    caseStatus: {
      RECEIVED: 0,
      UNDER_CARE: 0,
      PENDING: 0,
      COMPLETED: 0,
    },
    revenue: {
      total: {},
      extraServices: {},
    },
    serviceTypes: {
      Burial: 0,
      Cremation: 0,
      Other: 0,
    },
    paymentFrequency: {
      Premium: 0,
      Standard: 0,
      Basic: 0,
    },
    monthlyTrends: {},
    visitorTrends: {},
    coffinSales: [],
    averageStayDuration: {
      Burial: 3.2,
      Cremation: 2.9,
      Embalming: 2.2,
      'Viewing Only': 0.5,
    },
    hearseDistance: {
      'KDK Hearse': {},
      'KCM Mercedes': {},
      'Toyota Hiace': {},
      'Nissan Van': {},
    },
    revenueMeta: {
      currency: 'KES',
    },
    dispatchAnalytics: {},
    coffinInventory: {},
    operationalMetrics: {},
    financialMetrics: {},
    performanceIndicators: {},
  };
}

const getComprehensiveVehicleAnalytics = asyncHandler(async (req, res) => {
  try {
    console.log('🚗 Fetching vehicle kilometers summary...');

    const { month, year } = req.query;
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const currentYear = year ? parseInt(year) : new Date().getFullYear();

    // Simple query focusing on cumulative kilometers
    const kilometersQuery = `
      SELECT 
        vehicle_plate,
        
        -- Total Lifetime Kilometers
        COALESCE(SUM(distance_km + COALESCE(round_trip_km, 0)), 0) as total_kilometers,
        
        -- Current Month Kilometers
        COALESCE(SUM(CASE 
          WHEN MONTH(dispatch_date) = ? AND YEAR(dispatch_date) = ? 
          THEN distance_km + COALESCE(round_trip_km, 0) 
          ELSE 0 
        END), 0) as current_month_kilometers,
        
        -- Trip Counts
        COUNT(*) as total_trips,
        COUNT(CASE WHEN MONTH(dispatch_date) = ? AND YEAR(dispatch_date) = ? THEN 1 END) as current_month_trips,
        
        -- Current Active Trips
        COUNT(CASE WHEN status IN ('Assigned', 'In Transit') THEN 1 END) as active_trips,
        
        -- Average Trip Length
        COALESCE(AVG(distance_km + COALESCE(round_trip_km, 0)), 0) as avg_trip_length,
        
        -- Date Range
        MIN(dispatch_date) as first_trip_date,
        MAX(dispatch_date) as last_trip_date,
        
        -- Success Rate
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_trips,
        ROUND(
          (COUNT(CASE WHEN status = 'Completed' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)), 
          1
        ) as success_rate

      FROM vehicle_dispatch
      WHERE vehicle_plate IS NOT NULL AND vehicle_plate != ''
      GROUP BY vehicle_plate
      ORDER BY total_kilometers DESC
    `;

    const results = await safeQuery(kilometersQuery, [
      currentMonth,
      currentYear,
      currentMonth,
      currentYear,
    ]);

    // Process results - focus on kilometers data
    const vehiclesData = results.map((vehicle) => ({
      vehiclePlate: vehicle.vehicle_plate,
      kilometers: {
        total: Math.round(parseFloat(vehicle.total_kilometers) || 0),
        currentMonth: Math.round(
          parseFloat(vehicle.current_month_kilometers) || 0,
        ),
        averagePerTrip: Math.round(parseFloat(vehicle.avg_trip_length) || 0),
      },
      trips: {
        total: vehicle.total_trips,
        currentMonth: vehicle.current_month_trips,
        active: vehicle.active_trips,
        completed: vehicle.completed_trips,
        successRate: parseFloat(vehicle.success_rate) || 0,
      },
      activity: {
        firstTrip: vehicle.first_trip_date,
        lastTrip: vehicle.last_trip_date,
        isActive: vehicle.active_trips > 0,
      },
    }));

    // Calculate fleet totals
    const fleetSummary = {
      totalVehicles: results.length,
      totalKilometers: results.reduce(
        (sum, v) => sum + parseFloat(v.total_kilometers || 0),
        0,
      ),
      currentMonthKilometers: results.reduce(
        (sum, v) => sum + parseFloat(v.current_month_kilometers || 0),
        0,
      ),
      activeVehicles: results.filter((v) => v.active_trips > 0).length,
      totalTrips: results.reduce((sum, v) => sum + (v.total_trips || 0), 0),
    };

    // Find top performers
    const topPerformers = {
      byTotalKm: vehiclesData.slice(0, 3).map((v) => ({
        vehicle: v.vehiclePlate,
        kilometers: v.kilometers.total,
      })),
      byCurrentMonth: [...vehiclesData]
        .sort((a, b) => b.kilometers.currentMonth - a.kilometers.currentMonth)
        .slice(0, 3)
        .map((v) => ({
          vehicle: v.vehiclePlate,
          kilometers: v.kilometers.currentMonth,
        })),
    };

    const responseData = {
      success: true,
      message: 'Vehicle kilometers summary retrieved successfully',
      data: {
        fleetSummary,
        vehicles: vehiclesData,
        topPerformers,
        filters: {
          month: currentMonth,
          year: currentYear,
          timestamp: new Date().toISOString(),
        },
      },
    };

    console.log(`✅ Kilometers summary for ${results.length} vehicles`);

    res.status(200).json(responseData);
  } catch (error) {
    console.error('❌ Error in vehicle kilometers summary:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicle kilometers summary',
      error: error.message,
      data: {
        fleetSummary: {
          totalVehicles: 0,
          totalKilometers: 0,
          currentMonthKilometers: 0,
          activeVehicles: 0,
          totalTrips: 0,
        },
        vehicles: [],
        topPerformers: {
          byTotalKm: [],
          byCurrentMonth: [],
        },
        filters: {
          month: currentMonth,
          year: currentYear,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }
});

module.exports = {
  getMortuaryAnalytics,
  getComprehensiveVehicleAnalytics,
};
