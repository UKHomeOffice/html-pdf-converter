FROM quay.io/ukhomeofficedigital/nodejs-base:v6.9.1

RUN yum clean all && \
  yum update -y -q && \
  yum clean all && \
  rpm --rebuilddb

COPY package.json /app/package.json
RUN npm --loglevel warn install --production
COPY . /app

CMD ["npm", "start"]
