# HTML PDF Converter

[![Docker Repository on Quay](https://quay.io/repository/ukhomeofficedigital/html-pdf-converter/status "Docker Repository on Quay")](https://quay.io/repository/ukhomeofficedigital/html-pdf-converter)
[![Build Status](https://drone.digital.homeoffice.gov.uk/api/badges/UKHomeOffice/html-pdf-converter/status.svg)](https://drone.digital.homeoffice.gov.uk/UKHomeOffice/html-pdf-converter)
[![Build Status](https://travis-ci.org/UKHomeOffice/html-pdf-converter.svg?branch=master)](https://travis-ci.org/UKHomeOffice/html-pdf-converter)

#### Uses Chrome Headless to convert HTML to a PDF

Send a HTML or Mustache template and recieve a PDF stream as the response.

This implementation uses Docker to run [Chrome Headless (tip-of-tree)](https://chromedevtools.github.io/devtools-protocol/tot/). Using Docker is not a requirement but makes installation much easier.

## Install and start

### Chrome Headless
```bash
docker pull yukinying/chrome-headless/
docker run yukinying/chrome-headless
```

`chrome-headless` defaults to running at `localhost:9222`. You can override these settings with `CHROME_HOST` and `CHROME_PORT`.

### Node App
```bash
docker pull quay.io/ukhomeofficedigital/html-pdf-converter
docker run -p 8001:8001 html-pdf-converter
```

## Development

```bash
git clone git@github.com:UKHomeOffice/html-pdf-converter.git
cd html-pdf-converter

docker-compose build;docker-compose up
```

## Example usage

Mustache and Data
```bash
curl -H "Content-Type:application/json" \
     -d '{
            "template": "'"\
              <html>\
                <head>\
                  <title>{{title}}</title>\
                </head>\
                <body>\
                  <h1>{{header}}</h1>\
                  <p>{{para}}</p>\
                </body>\
              </html>\
            "'",
            "data": {
              "title": "My title",
              "header": "My header",
              "para": "My content"
            }
         }' \
     -i localhost:8001/convert
```

HTML
```bash
curl -H "Content-Type:application/json" \
     -d '{
            "template": "'"\
              <html>\
                <head>\
                  <title>My title</title>\
                </head>\
                <body>\
                  <p>Hello world</p>\
                </body>\
              </html>\
            "'"
         }' \
     -i localhost:8001/convert
```

Response (example)
```bash
%PDF-1.4\n1 0 obj\n<<\n/Title ...
```

## External Resources

This service cannot resolve external resources such as linked CSS, JavaScript or images.
If your template includes links to any of these resources, we suggest you use [https://github.com/remy/inliner](https://github.com/remy/inliner). The source for Inliner can be a URL, a file location or an HTML string.

## Environment Variables

```bash
APP_PORT:    Defaults to 8001
APP_HOST:    Defaults to 'localhost'
CHROME_HOST: Defaults to 'localhost'
CHROME_PORT: Defaults to 9222
```
