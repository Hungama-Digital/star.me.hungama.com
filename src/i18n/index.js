import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";

import en from "./locales/en.json";
import bn from "./locales/bn.json";
import hi from "./locales/hi.json";
import gu from "./locales/gu.json";
import kn from "./locales/kn.json";
import ml from "./locales/ml.json";
import mr from "./locales/mr.json";
import or from "./locales/or.json";
import pa from "./locales/pa.json";
import ta from "./locales/ta.json";
import te from "./locales/te.json";

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  bn: { translation: bn },
  gu: { translation: gu },
  kn: { translation: kn },
  ml: { translation: ml },
  mr: { translation: mr },
  or: { translation: or },
  pa: { translation: pa },
  ta: { translation: ta },
  te: { translation: te },
};

// device locale like: "en-IN", "hi-IN"
const deviceLocale = Localization.getLocales()?.[0]?.languageCode ?? "en";

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: deviceLocale,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: "v3",
  });

export default i18n;
