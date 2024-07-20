const puppeteer= require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const CREDENTIALS = require('./credentials.js').keys;
const SPREADSHEET_ID = CREDENTIALS.SSID;
const COOKIE_SHEET_NAME = CREDENTIALS.COOKIE_SHEET_NAME;
const COOKIE_SHEET_AREA = CREDENTIALS.COOKIE_SHEET_AREA;
const IMAGE_SHEET_NAME = CREDENTIALS.IMAGE_SHEET_NAME;
const FLAG_HEADER = 'flag';
const SERVICE_ACCOUNT = require('./client_secret.json');
const LOGIN_URL = 'https://x.com/login'
const TWEET_URL = 'https://x.com/compose/post'
const MYPAGE_URL = 'https://x.com/yukibot0725';
const USER_AGENT = 'user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36'
const fs = require('fs').promises;

async function sleep(delay) {
    return new Promise(resolve => setTimeout(resolve, delay));
}

async function inputUserID(page) {
    console.log('--- Input User Name --');
    const inputSelector = 'input[name="text"]';
    await page.waitForSelector(inputSelector);
    await page.type(inputSelector, CREDENTIALS.id);
    console.log('--- Push Signin Button ---');
    const buttonsSelector = 'button[role="button"]'
    const buttons = await page.$$(buttonsSelector);
    for(button of buttons){
        const text = await page.evaluate(span => span.textContent, button);
        if(text === undefined || text === null){
            continue;
        }
        if(text.trim() === 'Next'){
            await button.click();
        }
    };
}

async function inputPassword(page) {
    console.log('--- Input Password ---');
    const inputSelector = 'input[name="password"]';
    await page.waitForSelector(inputSelector);
    await page.type(inputSelector, CREDENTIALS.password);

    console.log('--- Push Login Button ---');
    const buttonSelector = 'button[role="button"]'
    await page.waitForSelector(buttonSelector);
    const buttons = await page.$$(buttonSelector);
    for(button of buttons){
        const text = await page.evaluate(span => span.textContent, button);
        if(text === undefined || text === null){
            continue;
        }
        if(text.trim() === 'Log in'){
            await button.click();
        }
    };
    await page.waitForNavigation({timeout: 3000, waitUntil: 'domcontentloaded'});
}

async function saveCookie(page) {
    console.log('--- Writing Cookie ---');
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    doc.useServiceAccountAuth(SERVICE_ACCOUNT);
    await doc.loadInfo(); 
    const sheet = doc.sheetsByTitle[COOKIE_SHEET_NAME];
    await sheet.loadCells(COOKIE_SHEET_AREA);
    const cell = sheet.getCell(0, 0);
    const afterCookies = await page.cookies();
    cell.value = JSON.stringify(afterCookies);
    await sheet.saveUpdatedCells();
}

async function loadCookie() {
    console.log('--- Reading Cookie ---');
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    doc.useServiceAccountAuth(SERVICE_ACCOUNT);
    await doc.loadInfo(); 
    const sheet = doc.sheetsByTitle[COOKIE_SHEET_NAME];
    await sheet.loadCells(COOKIE_SHEET_AREA);
    const cookies = JSON.parse(sheet.getCell(0, 0).value);
    return cookies;
}

async function inputTweetMessage(page, text) {
    console.log('--- Add Tweet Text ---');
    await page.type('div[aria-label="Post text"]', text);
}

async function uploadImages(page, image) {
    console.log('--- Add Image ---');
    const uploadButton = await page.$('input[type="file"]');
    await uploadButton.uploadFile(`./images/${image}`);
}

async function pushTweetButton(page) {
    console.log('--- Push Tweet Button ---');
    const postSelector = 'button[data-testid="tweetButton"]';
    await page.waitForSelector(postSelector);
    await page.click(postSelector);
}

async function login(page) {
    console.log('--- Login ---');
    await inputUserID(page);
    await inputPassword(page);
    await saveCookie(page);
}

function getRandomElement(array) {
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}

function getObject(sheet, row) {
    const rowData = row._rawData;
    const headerss = sheet.headerValues;
    const rowObject = {};

    headerss.forEach((header, index) => {
      rowObject[header] = rowData[index];
    });
    
    return rowObject;
}

async function getTweetContent() {
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    doc.useServiceAccountAuth(SERVICE_ACCOUNT);
    await doc.loadInfo(); 
    const sheet = doc.sheetsByTitle[IMAGE_SHEET_NAME];
    const rows = await sheet.getRows({
        offset: 0,
        limit: sheet.rowCount,
    });

    // すべてツイート済みであればフラグをクリアする
    if(rows.filter(row => !row[FLAG_HEADER]).length == 0) {
        for (const row of rows) {
            row[FLAG_HEADER] = '';
            await row.save();
        }
    }

    // フラグ設定
    const rowsWithoutFlag = rows.filter(row => !row[FLAG_HEADER]);
    const randomRowIndex = Math.floor(Math.random() * rowsWithoutFlag.length);
    const selectedRow = rowsWithoutFlag[randomRowIndex];
    const x = getObject(sheet, selectedRow);
    x.sheetObj = selectedRow;

    return x;
}

async function onFlag(row) {
    row[FLAG_HEADER] = 'true';
    await row.save();
}

async function getLatestTweetText(page) {
    const selector = 'div[data-testid="tweetText"]';
    await page.waitForSelector(selector);
    const texts = await page.$$(selector);
    const latestTweetText = await texts[0].evaluate(element => element.textContent);
    console.log(`--- Latest tweet: ${latestTweetText} ---`);
    return latestTweetText;
}


async function launch() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--incognito',
            '--no-sandbox'
        ]
    });
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.goto(LOGIN_URL);

    const cookies = await loadCookie();
    if(!!cookies){
        console.log('--- Confirmed Cookie ---');
        for (let cookie of cookies) {
            await page.setCookie(cookie);
        }
        await sleep(1500);
        await page.reload();
    } else {
        console.log('--- Failed to Confirm Cookie ---');
        await login(page);
    }

    await page.goto(TWEET_URL);
    const currentUrl = page.url();
    if(currentUrl !== TWEET_URL) {
        // 遷移先がログイン画面の場合はログインする
        await login(page);
    }
    
    const tweetContent = await getTweetContent();
    console.log (`--- Tweet Content: ${tweetContent.description} ---`)
    await sleep(1500);
    await inputTweetMessage(page, tweetContent.description);
    await sleep(1500);
    await uploadImages(page, tweetContent.image);
    await sleep(3000);
    await pushTweetButton(page);
    await sleep(3000);

    await page.goto(MYPAGE_URL);
    const latestTweetText = await getLatestTweetText(page);

    await browser.close();

    if(latestTweetText === tweetContent.description) {
        onFlag(tweetContent.sheetObj);
        return true;
    } else {
        return false
    }
}

const express = require('express');
const { on } = require('events');
const app = express();
const port = 8080;

const handleRequestAsync = async (req, res) => {
    try {
      if(await launch()) {
        res.send('success');
      } else {
        res.status(400).send('Bad Request');
      }
    } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
    }
};

app.get('/', handleRequestAsync);

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});