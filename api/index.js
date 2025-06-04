
const { fetch } = require('undici');
const cheerio = require('cheerio');

const CACHE_DURATION = 3600;
const BUILD_NUMBER_ENV = 'DISCORD_BUILD_NUMBER';
const BUILD_EXPIRE_ENV = 'DISCORD_BUILD_EXPIRE';

const headers = {
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Referer": "https://discord.com/login",
  "Sec-Ch-Ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "script",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "same-origin",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
};

async function extractAssetFiles() {
  try {
    const response = await fetch('https://discord.com/login', { headers });
    const htmlContent = await response.text();
    
    const $ = cheerio.load(htmlContent);
    const scripts = [];
    
    $('script[defer]').each((_, element) => {
      const src = $(element).attr('src');
      if (src && src.endsWith('.js')) {
        scripts.push(src);
      }
    });
    
    return scripts;
  } catch (error) {
    console.error('Error extracting asset files:', error);
    throw new Error('Failed to extract asset files from Discord login page');
  }
}

async function getBuildNumber() {
  try {
    const cachedBuildNumber = process.env[BUILD_NUMBER_ENV];
    const buildExpireTime = process.env[BUILD_EXPIRE_ENV];
    const currentTime = Math.floor(Date.now() / 1000);
    
    if (cachedBuildNumber && buildExpireTime && currentTime < parseInt(buildExpireTime)) {
      return cachedBuildNumber;
    }
    
    const files = await extractAssetFiles();
    
    for (const file of files) {
      const buildUrl = `https://discord.com${file}`;
      const response = await fetch(buildUrl, { headers });
      const jsContent = await response.text();
      
      if (!jsContent.includes('buildNumber')) continue;
      
      const buildNumberMatch = jsContent.match(/build_number:"([^"]+)"/);
      if (buildNumberMatch && buildNumberMatch[1]) {
        const buildNumber = buildNumberMatch[1];
        const expireTime = Math.floor(Date.now() / 1000) + CACHE_DURATION;
        
        process.env[BUILD_NUMBER_ENV] = buildNumber;
        process.env[BUILD_EXPIRE_ENV] = expireTime.toString();
        
        return buildNumber;
      }
    }
    
    throw new Error('Build number not found in any of the asset files');
  } catch (error) {
    console.error('Error getting build number:', error);
    throw error;
  }
}

module.exports = async (req, res) => {
  try {
    const buildNumber = await getBuildNumber();
    
    res.setHeader('Content-Type', 'application/json');
    
    res.status(200).json({ 
      build_number: buildNumber,
	  success: true
    });
  } catch (error) {
	res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false 
    });
  }
};
