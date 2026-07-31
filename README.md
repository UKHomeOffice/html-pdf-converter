# HTML PDF Converter

#### Uses Chrome Headless to convert HTML to a PDF

Send a HTML or Mustache template and receive a PDF stream as the response.

## Deployment

Deployment is managed via Argo CD using the Helm chart in chart/html-pdf-converter.
Image tags are produced by GitHub Actions and consumed by your Argo CD deployment workflow.

## Install and start

### Node App - Running a local html-pdf-instance in a docker container

Use the ECR image `<aws-account-id>.dkr.ecr.eu-west-2.amazonaws.com/hof/html-pdf-converter`. Docker will use Git tag that you specify.

For example, if the latest tagged version is v3.1.0 then this command will need to be run:

```bash
docker pull <aws-account-id>.dkr.ecr.eu-west-2.amazonaws.com/hof/html-pdf-converter:v3.1.0
```
Once completed you can check the image is available locally by running: 
```bash 
docker image list
``` 
All HOF forms run locally on port 8080 and in some cases port 8081 may also be in use; so the html-pdf-converter should be run on another port. Currently port 8082 is recommended.

```bash
docker run -t -i -p 8082:8080 <aws-account-id>.dkr.ecr.eu-west-2.amazonaws.com/hof/html-pdf-converter:<tag>
```

Observe following in terminal: 

```bash
2023-09-13T11:18:07.061Z - info: Listening on localhost:8080
```

Note: The terminal will say that the application is listening on port 8080, however you can verify which port the html-pdf-converter container is using by running:

```bash
docker ps -a
```

The Node app that is using the html to pdf converter will need to be run locally too. The service will need the following env variable:

- `PDF_CONVERTER_URL`: If you are running a local PDF converter this is the url and port it is running on. This URL should be in the format `PDF_CONVERTER_URL=http://localhost:<PORT>/convert`. 

- In this example the PDF_CONVERTER_URL would be `PDF_CONVERTER_URL=http://localhost:8082/convert`


Upon a successful html to pdf conversion the response should look something like this:

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
APP_PORT:         Defaults to 8080
PORT:             Fallback if APP_PORT is not set
APP_HOST:         Defaults to localhost
LOG_LEVEL:        Optional application log level
BODY_SIZE_LIMIT:  Defaults to 2mb
```
If you get the following error locally, `html-pdf-converter: Handling error message=Could not find browser revision 756035. Run "npm install" or "yarn install" to download a browser binary.`

## Troubleshooting

If you get a local Puppeteer browser error such as "Could not find browser" or a missing Chrome executable, reinstall dependencies to download a compatible browser binary.

Then you may need to manually install Puppeteer with `npm i puppeteer`.
