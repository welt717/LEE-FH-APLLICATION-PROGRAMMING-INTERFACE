const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Mortuary API by Welt Tallis',
      version: '1.0.0',
      description: `
        <div style="font-size:15px; line-height:1.6;">
          <b>Mortuary Management System (RestPoint)</b> <br/>
          API documentation for automating mortuary operations, tracking, and reporting. <br/><br/>
          <b>Developed by:</b> Peter Mumo<br/>
          <b>Organization:</b> Welt Tallis<br/>
          <b>Email:</b> <a href="mailto:infowelttallis@gmail.com">infowelttallis@gmail.com</a><br/>
          <b>Contact:</b> +254 740 045 355
        </div>
      `,
    },
    servers: [
      {
        url: 'http://localhost:5000/api/v1',
        description: 'Local Development Server',
      },
    ],
  },
  apis: ['./routes/*.js'], // make sure this path points to your routes folder
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

module.exports = setupSwagger;
