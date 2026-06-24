import moment from "moment-jalaali";
moment.loadPersian({ usePersianDigits: true, dialect: "persian-modern" });

export function toJalaliDate(iso) {
  if (!iso) return "";
  return moment(iso).format("jD jMMMM jYYYY");
}

export function toJalaliShort(iso) {
  if (!iso) return "";
  return moment(iso).format("jYYYY/jMM/jDD");
}

export function toJalaliDateTime(iso) {
  if (!iso) return "";
  return moment(iso).format("jD jMMMM jYYYY • HH:mm");
}

export function fromNow(iso) {
  if (!iso) return "";
  return moment(iso).fromNow();
}

export function toFaNumber(n) {
  if (n === null || n === undefined) return "";
  const map = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
  return String(n).replace(/\d/g, (d) => map[d]);
}
