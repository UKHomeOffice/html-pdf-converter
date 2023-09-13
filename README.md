# HTML PDF Converter

[![Docker Repository on Quay](https://quay.io/repository/ukhomeofficedigital/html-pdf-converter/status "Docker Repository on Quay")](https://quay.io/repository/ukhomeofficedigital/html-pdf-converter)
[![Build Status](https://drone.digital.homeoffice.gov.uk/api/badges/UKHomeOffice/html-pdf-converter/status.svg)](https://drone.digital.homeoffice.gov.uk/UKHomeOffice/html-pdf-converter)
[![Build Status](https://travis-ci.org/UKHomeOffice/html-pdf-converter.svg?branch=master)](https://travis-ci.org/UKHomeOffice/html-pdf-converter)

#### Uses Chrome Headless to convert HTML to a PDF

Send a HTML or Mustache template and recieve a PDF stream as the response.

## Install and start

### Docker container

Navigate to quay.io/ukhomeofficedigital/html-pdf-converter to find latest tagged version this will be the image that docker will pull.

For example, if the latest tagged version v2.4.3 then this command will need to be run:

```bash
docker pull quay.io/ukhomeofficedigital/html-pdf-converter:v2.4.3 
```
Once completed you can check quay.io/ukhomeofficedigital/html-pdf-converter repository is installed by running: 
```bash 
docker image list
``` 
All HOF forms run locally on port 8080 and in some cases port 8081 may also be in use; so the html-pdf-converter should be run on another port. Currently port 8082 is recommended.

```bash
docker run -t -i -p 8082:8080 quay.io/ukhomeofficedigital/html-pdf-converter:v2.4.3
```

Observe following in terminal: 

```bash
2023-09-13T11:18:07.061Z - info: Listening on localhost:8080
```

Note: The terminal will say that the application is listening on port 8080, however you can verify which port the html-pdf-converter container is using by running:

```bash
docker ps -a
```

The HOF form service that is using the html to pdf converter will need to be run locally too. The service will need the following env variable:

- `PDF_CONVERTER_URL`: If you are running a local PDF converter this is the url and port it is running on. This URL should be in the format `PDF_CONVERTER_URL=http://localhost:<PORT>/convert`. 

- In this example the PDF_CONVERTER_URL should look like `PDF_CONVERTER_URL=http://localhost:8082/convert`


Upon a successful html to pdf conversion the output should look something like this:

```bash
2023-09-12T15:31:30.249Z - info:  status=201, method=POST, url=/convert, response_time=392, content_length=39644
```


## Development

```bash
git clone git@github.com:UKHomeOffice/html-pdf-converter.git
cd html-pdf-converter
npm install
npm start
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
     -i localhost:8080/convert
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
     -i localhost:8080/convert
```

Response (example)
```bash
%PDF-1.4\n1 0 obj\n<<\n/Title ...
```

## PDF Options

Chrome can accept a number of options to its PDF render function. These are documented here: [https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagepdfoptions](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagepdfoptions)

These can be set on a per-request basis by passing a `pdfOptions` object as part of your request body.

```json
{
  "template":"<h1>Hello World!</h1>",
  "pdfOptions": {
    "printBackground": true
  }
}
```

## External Resources

This service cannot resolve external resources such as linked CSS, JavaScript or images.
If your template includes links to any of these resources, we suggest you use [https://github.com/remy/inliner](https://github.com/remy/inliner). The source for Inliner can be a URL, a file location or an HTML string.

## Environment Variables

```bash
APP_PORT:    Defaults to 8080
APP_HOST:    Defaults to 'localhost'
```

## Troubleshooting

If you get the following error locally, `html-pdf-converter: Handling error message=Could not find browser revision 756035. Run "npm install" or "yarn install" to download a browser binary.`

Then you may need to manually install puppeteer `npm i puppeteer`
