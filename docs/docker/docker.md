# 🚀 Deploying a Node.js Application with Docker and Kubernetes (Minikube)

This guide explains how to:

1. **Dockerize your application**
2. **Push the image to Docker Hub**
3. **Deploy it to Kubernetes using Minikube**

---

## 🐳 Step 1: Dockerize the Application

### Dockerfile

```dockerfile
# Base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json to working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Expose port 5000
EXPOSE 5000

# Start the application
CMD ["node", "index.js"]
.dockerignore
nginx
Copy code
node_modules
🧱 Step 2: Build and Run Docker Image Locally
Create Docker Image
bash
Copy code
docker build -t backendapi .
Run the Container
bash
Copy code
docker run -p 5000:5000 -d backendapi
☁️ Step 3: Push Docker Image to Docker Hub
Login to Docker Hub
bash
Copy code
docker login -u <username>
# Enter your Docker Hub password when prompted
Tag the Image
bash
Copy code
docker tag backendapi <username>/backendapi:1.0
Push the Image
bash
Copy code
docker push <username>/backendapi:1.0
☸️ Step 4: Deploy to Kubernetes (Minikube)
Start Minikube
bash
Copy code
minikube start
⚙️ Step 5: Create Deployment and Service YAML
Generate Deployment YAML
bash
Copy code
kubectl create deployment backendapi --image=<username>/backendapi:1.0 --port=5000 --dry-run=client -o yaml > deployment.yml
Apply the deployment:

bash
Copy code
kubectl apply -f deployment.yml
Generate Service YAML
bash
Copy code
kubectl expose deployment backendapi --port=80 --target-port=5000 --type=LoadBalancer --dry-run=client -o yaml > service.yml
Apply the service:

bash
Copy code
kubectl apply -f service.yml
🔍 Step 6: Verify Deployment
Check Deployments
bash
Copy code
kubectl get deployments
Get Service URL
bash
Copy code
minikube service backendapi --url
Describe Deployment or Service
bash
Copy code
kubectl describe service backendapi
View Service Endpoints
bash
Copy code
kubectl get endpoints
✅ Now your Node.js app is live on Kubernetes using Minikube!

Author: Peter Mumo
Role: Digital Infrastructure & API Security Specialist
Focus: Secure, compliant, and scalable infrastructure solutions.

yaml
Copy code

---

```
