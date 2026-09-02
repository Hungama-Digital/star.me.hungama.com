import MD5 from "crypto-js/md5";

export const generateAuthKey = (identity) => {
  let authKey = "PAYUNHUNGAMA#$2021";
  const key = `${authKey}:${identity}`;
  return MD5(key.trim()).toString().toLowerCase();
};
