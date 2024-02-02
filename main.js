const puppeteer= require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const CREDENTIALS = require('./credentials.js').keys;
const SPREADSHEET_ID = CREDENTIALS.SSID;
const SHEET_NAME = CREDENTIALS.SHEET_NAME;
const SHEET_AREA = CREDENTIALS.SHEET_AREA;
const SERVICE_ACCOUNT = require('./client_secret.json');
const LOGIN_URL = 'https://twitter.com/login'
const TWEET_URL = 'https://twitter.com/compose/tweet'
const MYPAGE_URL = 'https://twitter.com/yukibot0725';
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
    const buttonsSelector = 'div[role="button"]'
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
    const buttonSelector = 'div[role="button"]'
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
    const sheet = doc.sheetsByTitle[SHEET_NAME];
    await sheet.loadCells(SHEET_AREA);
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
    const sheet = doc.sheetsByTitle[SHEET_NAME];
    await sheet.loadCells(SHEET_AREA);
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
    const postSelector = 'div[data-testid="tweetButton"]';
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

async function getTweetContent() {
    return getRandomElement(JSON.parse(await fs.readFile('./images.json', 'utf8')));
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
    console.log (`--- Tweet Content: ${JSON.stringify(tweetContent)} ---`)
    await sleep(1500);
    await inputTweetMessage(page, tweetContent.description);
    await sleep(1500);
    await uploadImages(page, tweetContent.image);
    await sleep(3000);
    await pushTweetButton(page);
    // await sleep(3000);

    await page.goto(MYPAGE_URL);
    const latestTweetText = await getLatestTweetText(page);

    await browser.close();

    if(latestTweetText === tweetContent.description) {
        return true;
    } else {
        return false
    }
}

const express = require('express');
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