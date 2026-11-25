async function readPages(call,base) {
  const range = encodeURIComponent("'Dashboard Pages'!A2:K");
  const result = await call({url:base+'/values/'+range+'?valueRenderOption=UNFORMATTED_VALUE'});
  return result.values || [];
}
module.exports = {readPages};
