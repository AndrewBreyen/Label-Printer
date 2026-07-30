# Label Printer for Marklife P50S Printer

This package provides a simple Web app to print labels using the MarkLife P50S label printer.

It is a simple Web app that uses the MarkLife P50S label printer to print labels.

It is a work in progress, and the app is not yet complete.

The app is currently set up to print labels of a specific size, but the size can be changed by editing the `labelTemplates` object in `src/labelTemplates.js`

## Usage

!> **Note**: You MUST use Chrome to be able to connect to the printer.

1. Clone the repository
2. Install the dependencies (in the `label-printer` folder):
    - `npm install`
3. Run `npm start` to start the app

## Attributions

This web app uses the following libraries:

- [marklife-label-printer-web-kit](https://gitlab.com/marklife/marklife-label-printer-web-kit)