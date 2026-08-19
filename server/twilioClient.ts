import twilio from 'twilio';

let twilioClient: twilio.Twilio | null = null;

export interface GeoCountry {
  isoCode: string;
  name: string;
  dialCode: string;
}

const COUNTRY_DIAL_CODES: Record<string, string> = {
  US: "+1", CA: "+1", AU: "+61", GB: "+44", DE: "+49", FR: "+33",
  ES: "+34", IT: "+39", NL: "+31", BE: "+32", CH: "+41", AT: "+43",
  SE: "+46", NO: "+47", DK: "+45", FI: "+358", IE: "+353", PT: "+351",
  PL: "+48", GR: "+30", CZ: "+420", HU: "+36", RO: "+40", RU: "+7",
  UA: "+380", TR: "+90", IL: "+972", SA: "+966", AE: "+971", QA: "+974",
  KW: "+965", EG: "+20", ZA: "+27", NG: "+234", KE: "+254", MA: "+212",
  IN: "+91", PK: "+92", BD: "+880", CN: "+86", JP: "+81", KR: "+82",
  TW: "+886", HK: "+852", SG: "+65", MY: "+60", ID: "+62", PH: "+63",
  TH: "+66", VN: "+84", MX: "+52", BR: "+55", AR: "+54", CO: "+57",
  CL: "+56", PE: "+51", VE: "+58", EC: "+593", NZ: "+64",
};

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CA: "Canada", AU: "Australia", GB: "United Kingdom",
  DE: "Germany", FR: "France", ES: "Spain", IT: "Italy", NL: "Netherlands",
  BE: "Belgium", CH: "Switzerland", AT: "Austria", SE: "Sweden", NO: "Norway",
  DK: "Denmark", FI: "Finland", IE: "Ireland", PT: "Portugal", PL: "Poland",
  GR: "Greece", CZ: "Czech Republic", HU: "Hungary", RO: "Romania", RU: "Russia",
  UA: "Ukraine", TR: "Turkey", IL: "Israel", SA: "Saudi Arabia",
  AE: "United Arab Emirates", QA: "Qatar", KW: "Kuwait", EG: "Egypt",
  ZA: "South Africa", NG: "Nigeria", KE: "Kenya", MA: "Morocco", IN: "India",
  PK: "Pakistan", BD: "Bangladesh", CN: "China", JP: "Japan", KR: "South Korea",
  TW: "Taiwan", HK: "Hong Kong", SG: "Singapore", MY: "Malaysia", ID: "Indonesia",
  PH: "Philippines", TH: "Thailand", VN: "Vietnam", MX: "Mexico", BR: "Brazil",
  AR: "Argentina", CO: "Colombia", CL: "Chile", PE: "Peru", VE: "Venezuela",
  EC: "Ecuador", NZ: "New Zealand",
};

interface GeoPermissionsCache {
  countries: GeoCountry[];
  configuredValue: string;
  twilioConfigured: boolean;
  configured: boolean;
  message?: string;
  timestamp: number;
}

let geoPermissionsCache: GeoPermissionsCache | null = null;
const GEO_CACHE_TTL = 6 * 60 * 60 * 1000;

export function isTwilioConfigured(): boolean {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token;
  return !!(accountSid && authToken);
}

export function getTwilioClient(): twilio.Twilio {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token;

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials must be set');
    }

    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

export interface GeoPermissionsResult {
  countries: GeoCountry[];
  configured: boolean;
  message?: string;
}

export function getEnabledSmsCountries(): GeoPermissionsResult {
  const allowedCountriesEnv = process.env.ALLOWED_COUNTRIES || process.env.Allowed_Countries || '';
  const currentConfigValue = allowedCountriesEnv.trim();
  const currentTwilioConfigured = isTwilioConfigured();
  
  if (
    geoPermissionsCache && 
    geoPermissionsCache.configuredValue === currentConfigValue &&
    geoPermissionsCache.twilioConfigured === currentTwilioConfigured &&
    Date.now() - geoPermissionsCache.timestamp < GEO_CACHE_TTL
  ) {
    return { 
      countries: geoPermissionsCache.countries, 
      configured: geoPermissionsCache.configured,
      message: geoPermissionsCache.message,
    };
  }
  
  if (currentConfigValue) {
    // Dedupe defensively — the ALLOWED_COUNTRIES value is hand-edited in the
    // Render dashboard and has shown up with each code listed twice, which
    // otherwise renders every country twice in the sign-up country picker.
    const codes = Array.from(
      new Set(currentConfigValue.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)),
    );
    const enabledCountries: GeoCountry[] = [];
    const invalidCodes: string[] = [];

    for (const code of codes) {
      const dialCode = COUNTRY_DIAL_CODES[code];
      const name = COUNTRY_NAMES[code];

      if (dialCode && name) {
        enabledCountries.push({ isoCode: code, name, dialCode });
      } else if (code.length > 0) {
        invalidCodes.push(code);
      }
    }
    
    if (invalidCodes.length > 0) {
      console.warn(`Invalid country codes in ALLOWED_COUNTRIES: ${invalidCodes.join(', ')}`);
    }
    
    if (enabledCountries.length > 0) {
      enabledCountries.sort((a, b) => a.name.localeCompare(b.name));
      geoPermissionsCache = {
        countries: enabledCountries,
        configuredValue: currentConfigValue,
        twilioConfigured: currentTwilioConfigured,
        configured: true,
        timestamp: Date.now(),
      };
      
      console.log(`Loaded ${enabledCountries.length} allowed countries from ALLOWED_COUNTRIES: ${enabledCountries.map(c => c.isoCode).join(', ')}`);
      return { countries: enabledCountries, configured: true };
    } else {
      console.error('ALLOWED_COUNTRIES is set but contains no valid country codes');
    }
  } else {
    console.log('ALLOWED_COUNTRIES not set, exposing all known countries');
  }

  const defaultCountries: GeoCountry[] = Object.keys(COUNTRY_NAMES)
    .filter((code) => COUNTRY_DIAL_CODES[code] && COUNTRY_NAMES[code])
    .map((code) => ({
      isoCode: code,
      name: COUNTRY_NAMES[code],
      dialCode: COUNTRY_DIAL_CODES[code],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  geoPermissionsCache = {
    countries: defaultCountries,
    configuredValue: '',
    twilioConfigured: currentTwilioConfigured,
    configured: false,
    timestamp: Date.now(),
  };

  return {
    countries: defaultCountries,
    configured: false,
  };
}

export interface SendSMSResult {
  success: boolean;
  error?: string;
  userMessage?: string;
}

export async function sendVerificationSMS(phoneNumber: string, code: string): Promise<SendSMSResult> {
  try {
    const client = getTwilioClient();
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number;

    if (!fromNumber) {
      return {
        success: false,
        error: 'TWILIO_PHONE_NUMBER not set',
        userMessage: 'SMS service is not configured. Please contact support.',
      };
    }

    await client.messages.create({
      body: `Your Pryvo verification code is: ${code}. This code expires in 10 minutes.`,
      from: fromNumber,
      to: phoneNumber,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Failed to send SMS:', error);

    const twilioCode = error?.code;
    let userMessage = 'Failed to send verification code. Please try again.';
    
    if (twilioCode === 21211 || twilioCode === 21614) {
      userMessage = 'Please enter a valid phone number with the correct country code.';
    } else if (twilioCode === 21612 || twilioCode === 21408) {
      userMessage = 'This phone number cannot receive SMS. Please use a mobile number.';
    } else if (twilioCode === 21610) {
      userMessage = 'This number has been blocked. Please try a different number.';
    } else if (twilioCode === 21606 || twilioCode === 21607) {
      userMessage = 'SMS service is temporarily unavailable. Please try again later.';
    } else if (twilioCode === 21608) {
      userMessage = 'SMS verification is not available for this region. Please contact support.';
    } else if (twilioCode === 21219) {
      userMessage = 'Unable to send to this phone number. Please verify your number is correct.';
    } else if (twilioCode === 21617) {
      userMessage = 'Message too long. Please contact support.';
    } else if (twilioCode === 20003 || twilioCode === 20404) {
      userMessage = 'SMS service is temporarily unavailable. Please try again later.';
    }

    return {
      success: false,
      error: error?.message || 'Unknown error',
      userMessage,
    };
  }
}

// Security notice to the OLD number when a phone-number change completes —
// best-effort only (caller swallows failures) so a delivery hiccup here
// never blocks the actual number change.
export async function sendPhoneChangeNoticeSMS(oldPhoneNumber: string): Promise<SendSMSResult> {
  try {
    const client = getTwilioClient();
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number;
    if (!fromNumber) {
      return { success: false, error: 'TWILIO_PHONE_NUMBER not set' };
    }
    await client.messages.create({
      body: `Your Pryvo account's phone number was just changed. If this wasn't you, contact support immediately.`,
      from: fromNumber,
      to: oldPhoneNumber,
    });
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send phone-change notice SMS:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendInviteSMS(phoneNumber: string, senderName: string): Promise<boolean> {
  try {
    const client = getTwilioClient();
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.Twilio_Phone_Number;

    if (!fromNumber) {
      throw new Error('TWILIO_PHONE_NUMBER must be set');
    }

    await client.messages.create({
      body: `${senderName} wants to message you on SecureChat! Download the app to start chatting securely.`,
      from: fromNumber,
      to: phoneNumber,
    });

    return true;
  } catch (error) {
    console.error('Failed to send invite SMS:', error);
    return false;
  }
}

// Virtual Number Management Functions

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
}

export interface ProvisionedNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
}

export async function searchAvailableNumbers(
  countryCode: string,
  areaCode?: string
): Promise<{ success: boolean; numbers?: AvailableNumber[]; error?: string }> {
  try {
    const client = getTwilioClient();
    
    const searchParams: any = {
      voiceEnabled: true,
      smsEnabled: true,
      limit: 10,
    };
    
    if (areaCode) {
      searchParams.areaCode = areaCode;
    }
    
    let allNumbers: AvailableNumber[] = [];
    
    // Try local numbers first
    try {
      console.log(`Searching for local numbers in ${countryCode}...`);
      const localNumbers = await client.availablePhoneNumbers(countryCode)
        .local
        .list(searchParams);
      
      allNumbers = localNumbers.map(num => ({
        phoneNumber: num.phoneNumber,
        friendlyName: num.friendlyName,
        locality: num.locality || '',
        region: num.region || '',
        capabilities: {
          voice: !!num.capabilities.voice,
          sms: !!num.capabilities.sms,
          mms: !!num.capabilities.mms,
        },
      }));
      console.log(`Found ${allNumbers.length} local numbers`);
    } catch (localErr: any) {
      console.log(`No local numbers available: ${localErr.message}`);
    }
    
    // If no local numbers, try toll-free (US, CA, UK only)
    if (allNumbers.length === 0 && ['US', 'CA', 'GB'].includes(countryCode)) {
      try {
        console.log(`Searching for toll-free numbers in ${countryCode}...`);
        const tollFreeNumbers = await client.availablePhoneNumbers(countryCode)
          .tollFree
          .list({ voiceEnabled: true, smsEnabled: true, limit: 10 });
        
        allNumbers = tollFreeNumbers.map(num => ({
          phoneNumber: num.phoneNumber,
          friendlyName: num.friendlyName,
          locality: 'Toll-Free',
          region: countryCode,
          capabilities: {
            voice: !!num.capabilities.voice,
            sms: !!num.capabilities.sms,
            mms: !!num.capabilities.mms,
          },
        }));
        console.log(`Found ${allNumbers.length} toll-free numbers`);
      } catch (tollFreeErr: any) {
        console.log(`No toll-free numbers available: ${tollFreeErr.message}`);
      }
    }
    
    // If still no numbers, try mobile (for supported countries)
    if (allNumbers.length === 0) {
      try {
        console.log(`Searching for mobile numbers in ${countryCode}...`);
        const mobileNumbers = await client.availablePhoneNumbers(countryCode)
          .mobile
          .list({ voiceEnabled: true, smsEnabled: true, limit: 10 });
        
        allNumbers = mobileNumbers.map(num => ({
          phoneNumber: num.phoneNumber,
          friendlyName: num.friendlyName,
          locality: 'Mobile',
          region: num.region || countryCode,
          capabilities: {
            voice: !!num.capabilities.voice,
            sms: !!num.capabilities.sms,
            mms: !!num.capabilities.mms,
          },
        }));
        console.log(`Found ${allNumbers.length} mobile numbers`);
      } catch (mobileErr: any) {
        console.log(`No mobile numbers available: ${mobileErr.message}`);
      }
    }
    
    return { success: true, numbers: allNumbers };
  } catch (error: any) {
    console.error('Failed to search available numbers:', error);
    
    // Provide helpful error messages
    let userError = 'Failed to search available numbers';
    if (error?.code === 21452 || error?.message?.includes('not available')) {
      userError = `Phone numbers are not available in ${countryCode}. Try a different country.`;
    } else if (error?.code === 20003) {
      userError = 'Phone number service is temporarily unavailable. Please try again later.';
    }
    
    return { 
      success: false, 
      error: userError
    };
  }
}

export async function provisionPhoneNumber(
  phoneNumber: string,
  friendlyName: string,
  webhookBaseUrl: string
): Promise<{ success: boolean; number?: ProvisionedNumber; error?: string }> {
  try {
    const client = getTwilioClient();
    
    console.log(`Provisioning number ${phoneNumber} with webhook URL: ${webhookBaseUrl}`);
    
    if (!webhookBaseUrl || webhookBaseUrl.includes('undefined')) {
      console.error('Invalid webhook base URL provided:', webhookBaseUrl);
      return { success: false, error: 'Server configuration error. Please contact support.' };
    }
    
    // Purchase the phone number with webhook configuration
    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: phoneNumber,
      friendlyName: friendlyName,
      voiceUrl: `${webhookBaseUrl}/api/webhooks/twilio/voice`,
      voiceMethod: 'POST',
      smsUrl: `${webhookBaseUrl}/api/webhooks/twilio/sms`,
      smsMethod: 'POST',
    });
    
    return {
      success: true,
      number: {
        sid: purchasedNumber.sid,
        phoneNumber: purchasedNumber.phoneNumber,
        friendlyName: purchasedNumber.friendlyName,
        capabilities: {
          voice: purchasedNumber.capabilities.voice,
          sms: purchasedNumber.capabilities.sms,
          mms: purchasedNumber.capabilities.mms,
        },
      },
    };
  } catch (error: any) {
    console.error('Failed to provision phone number:', error?.message || error);
    console.error('Twilio error code:', error?.code);
    console.error('Twilio error details:', error?.moreInfo || 'none');
    
    let userError = 'Failed to get your Pryvo number. Please try again.';
    
    if (error?.code === 21422) {
      userError = 'This number is no longer available. Please select a different number.';
    } else if (error?.code === 21451) {
      userError = 'Account balance insufficient for this purchase. Please contact support.';
    } else if (error?.code === 21452) {
      userError = 'Phone number provisioning is not available in your region.';
    } else if (error?.code === 20003) {
      userError = 'Authentication failed. Please check Twilio credentials.';
    } else if (error?.code === 21212) {
      userError = 'Invalid phone number format. Please select a different number.';
    } else if (error?.code === 21214) {
      userError = 'This number cannot be purchased. Please select a different number.';
    } else if (error?.code === 21606 || error?.code === 21215) {
      userError = 'Phone number purchasing is not enabled for this account. Please contact support.';
    } else if (error?.message) {
      userError = `Unable to provision number: ${error.message}`;
    }
    
    return { success: false, error: userError };
  }
}

export async function releasePhoneNumber(
  twilioSid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getTwilioClient();
    
    // Release (delete) the phone number from Twilio
    await client.incomingPhoneNumbers(twilioSid).remove();
    
    return { success: true };
  } catch (error: any) {
    console.error('Failed to release phone number:', error);
    return { 
      success: false, 
      error: error?.message || 'Failed to release phone number' 
    };
  }
}

export function validateTwilioWebhookSignature(
  signature: string | undefined,
  url: string,
  params: Record<string, string>
): boolean {
  if (!signature) {
    console.warn('Missing Twilio signature header');
    return false;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token;
  if (!authToken) {
    console.error('Twilio auth token not configured for webhook validation');
    return false;
  }

  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch (error) {
    console.error('Error validating Twilio signature:', error);
    return false;
  }
}
