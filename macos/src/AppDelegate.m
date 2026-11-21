#import "AppDelegate.h"
#import <QuartzCore/QuartzCore.h>
#import <UserNotifications/UserNotifications.h>

static const unsigned long long kMaxImportBytes = 8ULL * 1024ULL * 1024ULL;

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self setupMainMenu];

    NSRect frame = NSMakeRect(0, 0, 1320, 860);
    NSWindowStyleMask style = NSWindowStyleMaskTitled
                            | NSWindowStyleMaskClosable
                            | NSWindowStyleMaskMiniaturizable
                            | NSWindowStyleMaskResizable;

    self.window = [[NSWindow alloc] initWithContentRect:frame
                                              styleMask:style
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    self.window.title = @"Allegro · 课表与日程";
    self.window.minSize = NSMakeSize(900, 620);
    self.window.delegate = self;
    [self.window center];

    NSView *contentView = self.window.contentView;
    contentView.wantsLayer = YES;

    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    config.websiteDataStore = [WKWebsiteDataStore defaultDataStore];
    [config.preferences setValue:@YES forKey:@"allowFileAccessFromFileURLs"];

    WKUserContentController *ucc = [[WKUserContentController alloc] init];
    [ucc addScriptMessageHandler:self name:@"allegroNative"];

    NSString *shimJS =
        @"window.chrome = window.chrome || {};\n"
        @"window.chrome.webview = {\n"
        @"  _listeners: [],\n"
        @"  postMessage: function(msg) {\n"
        @"    window.webkit.messageHandlers.allegroNative.postMessage(msg);\n"
        @"  },\n"
        @"  addEventListener: function(event, handler) {\n"
        @"    if (event === 'message') { this._listeners.push(handler); }\n"
        @"  },\n"
        @"  _dispatch: function(data) {\n"
        @"    var ev = { data: data };\n"
        @"    for (var i = 0; i < this._listeners.length; i++) {\n"
        @"      try { this._listeners[i](ev); } catch (e) { console.error(e); }\n"
        @"    }\n"
        @"  }\n"
        @"};\n"
        @"(function() {\n"
        @"  var origFetch = window.fetch;\n"
        @"  var reqSeq = 0;\n"
        @"  window.__macNativePending = {};\n"
        @"  window.__macNativeFetchReply = function(id, res) {\n"
        @"    var p = window.__macNativePending[id];\n"
        @"    if (!p) return;\n"
        @"    delete window.__macNativePending[id];\n"
        @"    if (res.error) {\n"
        @"      p.reject(new TypeError(res.error));\n"
        @"    } else {\n"
        @"      var noBody = (res.status === 204 || res.status === 205 || res.status === 304);\n"
        @"      var response = new Response(noBody ? null : res.body, {\n"
        @"        status: res.status,\n"
        @"        statusText: res.statusText || 'OK',\n"
        @"        headers: res.headers || {}\n"
        @"      });\n"
        @"      p.resolve(response);\n"
        @"    }\n"
        @"  };\n"
        @"  window.fetch = function(input, init) {\n"
        @"    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');\n"
        @"    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {\n"
        @"      init = init || {};\n"
        @"      var id = 'fetch_' + (++reqSeq);\n"
        @"      var headers = {};\n"
        @"      if (init.headers) {\n"
        @"        if (init.headers instanceof Headers) {\n"
        @"          init.headers.forEach(function(v, k) { headers[k] = v; });\n"
        @"        } else if (typeof init.headers === 'object') {\n"
        @"          for (var k in init.headers) {\n"
        @"            if (Object.prototype.hasOwnProperty.call(init.headers, k)) { headers[k] = init.headers[k]; }\n"
        @"          }\n"
        @"        }\n"
        @"      }\n"
        @"      var bodyStr = (init.body == null) ? '' : String(init.body);\n"
        @"      return new Promise(function(resolve, reject) {\n"
        @"        window.__macNativePending[id] = { resolve: resolve, reject: reject };\n"
        @"        if (init.signal) {\n"
        @"          init.signal.addEventListener('abort', function() {\n"
        @"            if (window.__macNativePending[id]) {\n"
        @"              delete window.__macNativePending[id];\n"
        @"              reject(new DOMException('Aborted', 'AbortError'));\n"
        @"            }\n"
        @"          });\n"
        @"        }\n"
        @"        window.webkit.messageHandlers.allegroNative.postMessage(JSON.stringify({\n"
        @"          id: id,\n"
        @"          method: '__nativeFetch',\n"
        @"          args: [url, init.method || 'GET', headers, bodyStr]\n"
        @"        }));\n"
        @"      });\n"
        @"    }\n"
        @"    return origFetch.apply(this, arguments);\n"
        @"  };\n"
        @"})();\n";

    WKUserScript *userScript = [[WKUserScript alloc] initWithSource:shimJS
                                                      injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                                   forMainFrameOnly:YES];
    [ucc addUserScript:userScript];
    config.userContentController = ucc;

    self.webView = [[WKWebView alloc] initWithFrame:contentView.bounds configuration:config];
    self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;
    self.webView.wantsLayer = YES;
    [contentView addSubview:self.webView];

    NSString *resPath = [[NSBundle mainBundle] resourcePath];
    NSString *appDirPath = [resPath stringByAppendingPathComponent:@"app"];
    NSString *indexPath = [appDirPath stringByAppendingPathComponent:@"index.html"];
    NSURL *appDirURL = [NSURL fileURLWithPath:appDirPath isDirectory:YES];
    NSURL *indexURL = [NSURL fileURLWithPath:indexPath isDirectory:NO];
    [self.webView loadFileURL:indexURL allowingReadAccessToURL:appDirURL];

    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

- (void)setupMainMenu {
    NSMenu *mainMenu = [[NSMenu alloc] init];
    NSMenuItem *appMenuItem = [[NSMenuItem alloc] init];
    [mainMenu addItem:appMenuItem];

    NSMenu *appMenu = [[NSMenu alloc] init];
    NSMenuItem *quitItem = [[NSMenuItem alloc] initWithTitle:@"退出 Allegro"
                                                      action:@selector(terminate:)
                                               keyEquivalent:@"q"];
    [appMenu addItem:quitItem];
    [appMenuItem setSubmenu:appMenu];

    NSMenuItem *editMenuItem = [[NSMenuItem alloc] initWithTitle:@"编辑" action:nil keyEquivalent:@""];
    [mainMenu addItem:editMenuItem];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"编辑"];
    [editMenu addItemWithTitle:@"撤销" action:@selector(undo:) keyEquivalent:@"z"];
    [editMenu addItemWithTitle:@"重做" action:@selector(redo:) keyEquivalent:@"Z"];
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:@"剪切" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"拷贝" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"粘贴" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"全选" action:@selector(selectAll:) keyEquivalent:@"a"];
    [editMenuItem setSubmenu:editMenu];

    [NSApp setMainMenu:mainMenu];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag {
    if (!flag && self.window) {
        [self.window makeKeyAndOrderFront:nil];
    }
    return YES;
}

- (void)windowDidResize:(NSNotification *)notification {
    [self postEvent:@{@"event": @"resize"}];
}

/* ── WKNavigationDelegate & WKUIDelegate ─────────────────────────────── */

- (void)webView:(WKWebView *)webView
decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    if (navigationAction.navigationType == WKNavigationTypeLinkActivated &&
        ([url.scheme isEqualToString:@"http"] || [url.scheme isEqualToString:@"https"])) {
        [[NSWorkspace sharedWorkspace] openURL:url];
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }
    decisionHandler(WKNavigationActionPolicyAllow);
}

- (void)webView:(WKWebView *)webView
runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters
initiatedByFrame:(WKFrameInfo *)frame
completionHandler:(void (^)(NSArray<NSURL *> * _Nullable))completionHandler {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection;
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    if (@available(macOS 10.15, *)) {
        panel.canChooseDirectories = parameters.allowsDirectories;
    }
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        if (result == NSModalResponseOK) {
            completionHandler(panel.URLs);
        } else {
            completionHandler(nil);
        }
    }];
}

/* ── JS ↔ Native Message Bridge ─────────────────────────────────────── */

- (void)postEvent:(NSDictionary *)payload {
    if (!payload || !self.webView) { return; }
    NSError *err = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:&err];
    if (!data || err) { return; }
    NSString *jsonStr = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    NSString *js = [NSString stringWithFormat:@"if(window.chrome&&window.chrome.webview&&window.chrome.webview._dispatch){window.chrome.webview._dispatch(%@);}", jsonStr];
    dispatch_async(dispatch_get_main_queue(), ^{
        [self.webView evaluateJavaScript:js completionHandler:nil];
    });
}

- (void)replyToId:(NSString *)msgId result:(id)result error:(NSString *)error {
    if (msgId.length == 0) { return; }
    NSMutableDictionary *payload = [NSMutableDictionary dictionary];
    payload[@"replyTo"] = msgId;
    if (error.length > 0) {
        payload[@"error"] = error;
    } else {
        payload[@"result"] = result ?: [NSNull null];
    }
    [self postEvent:payload];
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    NSDictionary *msg = nil;
    if ([message.body isKindOfClass:[NSString class]]) {
        NSData *data = [(NSString *)message.body dataUsingEncoding:NSUTF8StringEncoding];
        if (data) {
            id obj = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
            if ([obj isKindOfClass:[NSDictionary class]]) { msg = (NSDictionary *)obj; }
        }
    } else if ([message.body isKindOfClass:[NSDictionary class]]) {
        msg = (NSDictionary *)message.body;
    }
    if (!msg) { return; }

    NSString *msgId = [msg[@"id"] isKindOfClass:[NSString class]] ? msg[@"id"] : nil;
    NSString *method = [msg[@"method"] isKindOfClass:[NSString class]] ? msg[@"method"] : @"";
    NSArray *args = [msg[@"args"] isKindOfClass:[NSArray class]] ? msg[@"args"] : @[];

    if ([method isEqualToString:@"__nativeFetch"]) {
        [self handleNativeFetch:args msgId:msgId];
        return;
    }

    [self dispatchMethod:method args:args msgId:msgId];
}

- (NSString *)strArg:(NSArray *)args at:(NSUInteger)idx {
    if (!args || idx >= args.count) { return @""; }
    id v = args[idx];
    if (!v || v == [NSNull null]) { return @""; }
    if ([v isKindOfClass:[NSString class]]) { return (NSString *)v; }
    return [v description];
}

- (BOOL)boolArg:(NSArray *)args at:(NSUInteger)idx {
    if (!args || idx >= args.count) { return NO; }
    id v = args[idx];
    if (!v || v == [NSNull null]) { return NO; }
    if ([v isKindOfClass:[NSNumber class]]) { return [v boolValue]; }
    return [[v description] boolValue];
}

- (long long)longArg:(NSArray *)args at:(NSUInteger)idx {
    if (!args || idx >= args.count) { return 0; }
    id v = args[idx];
    if (!v || v == [NSNull null]) { return 0; }
    if ([v isKindOfClass:[NSNumber class]]) { return [v longLongValue]; }
    return [[v description] longLongValue];
}

- (void)dispatchMethod:(NSString *)method args:(NSArray *)args msgId:(NSString *)msgId {
    NSString *m = [method lowercaseString];

    if ([m isEqualToString:@"platform"]) {
        [self replyToId:msgId result:@"macos" error:nil];
    } else if ([m isEqualToString:@"sdkint"]) {
        [self replyToId:msgId result:@0 error:nil];
    } else if ([m isEqualToString:@"devicename"]) {
        NSString *name = [[NSHost currentHost] localizedName] ?: @"Mac";
        [self replyToId:msgId result:name error:nil];
    } else if ([m isEqualToString:@"appversion"]) {
        NSString *ver = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"0.5.6";
        [self replyToId:msgId result:ver error:nil];
    } else if ([m isEqualToString:@"vibrate"] || [m isEqualToString:@"toast"]) {
        [self replyToId:msgId result:nil error:nil];
    } else if ([m isEqualToString:@"canhandle"]) {
        [self replyToId:msgId result:@YES error:nil];
    } else if ([m isEqualToString:@"beep"]) {
        if ([[self strArg:args at:0] isEqualToString:@"warn"]) {
            NSBeep();
        }
        [self replyToId:msgId result:@"ok" error:nil];
    } else if ([m isEqualToString:@"copy"]) {
        NSPasteboard *pb = [NSPasteboard generalPasteboard];
        [pb clearContents];
        [pb setString:[self strArg:args at:0] forType:NSPasteboardTypeString];
        [self replyToId:msgId result:@"ok" error:nil];
    } else if ([m isEqualToString:@"sharetext"]) {
        NSPasteboard *pb = [NSPasteboard generalPasteboard];
        [pb clearContents];
        [pb setString:[self strArg:args at:1] forType:NSPasteboardTypeString];
        [self replyToId:msgId result:@"copied" error:nil];
    } else if ([m isEqualToString:@"openurl"]) {
        NSURL *u = [NSURL URLWithString:[self strArg:args at:0]];
        if (u) { [[NSWorkspace sharedWorkspace] openURL:u]; }
        [self replyToId:msgId result:@"ok" error:nil];
    } else if ([m isEqualToString:@"openmap"]) {
        NSString *pref = [self strArg:args at:0];
        NSString *kw = [self strArg:args at:1];
        NSString *webFallback = [self strArg:args at:2];
        NSString *urlStr = webFallback;
        if (urlStr.length == 0) {
            NSString *q = [kw stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet URLQueryAllowedCharacterSet]] ?: @"";
            if ([pref isEqualToString:@"baidu"]) {
                urlStr = [NSString stringWithFormat:@"https://map.baidu.com/search/%@", q];
            } else if ([pref isEqualToString:@"google"]) {
                urlStr = [NSString stringWithFormat:@"https://maps.google.com/?q=%@", q];
            } else {
                urlStr = [NSString stringWithFormat:@"https://uri.amap.com/search?keyword=%@", q];
            }
        }
        NSURL *u = [NSURL URLWithString:urlStr];
        if (u) { [[NSWorkspace sharedWorkspace] openURL:u]; }
        [self replyToId:msgId result:urlStr error:nil];
    } else if ([m isEqualToString:@"setalarm"]) {
        int hh = (int)[self longArg:args at:0];
        int mm = (int)[self longArg:args at:1];
        NSString *msg = [self strArg:args at:2];
        NSString *txt = [NSString stringWithFormat:@"%02d:%02d%@", hh, mm, msg.length ? [@" " stringByAppendingString:msg] : @""];
        NSPasteboard *pb = [NSPasteboard generalPasteboard];
        [pb clearContents];
        [pb setString:txt forType:NSPasteboardTypeString];
        [self replyToId:msgId result:[NSString stringWithFormat:@"macOS 无系统闹钟接口，已复制「%@」，可添加到系统「时钟」应用。", txt] error:nil];
    } else if ([m isEqualToString:@"addcalendarevent"]) {
        [self handleAddCalendarEvent:args msgId:msgId];
    } else if ([m isEqualToString:@"exporttext"]) {
        [self handleExportText:args msgId:msgId];
    } else if ([m isEqualToString:@"importtext"]) {
        [self handleImportText:msgId];
    } else if ([m isEqualToString:@"sharefile"]) {
        [self handleShareFile:args msgId:msgId];
    } else if ([m isEqualToString:@"saveimage"]) {
        [self handleSaveImage:args msgId:msgId];
    } else if ([m isEqualToString:@"shareimage"]) {
        [self handleShareImage:args msgId:msgId];
    } else if ([m isEqualToString:@"listexports"]) {
        [self handleListExports:msgId];
    } else if ([m isEqualToString:@"readtexturi"]) {
        [self handleReadTextUri:args msgId:msgId];
    } else if ([m isEqualToString:@"setsystembars"] || [m isEqualToString:@"setbackdrop"]) {
        [self replyToId:msgId result:@"ok" error:nil];
    } else if ([m isEqualToString:@"notify"]) {
        [self handleNotifyTitle:[self strArg:args at:0] body:[self strArg:args at:1] msgId:msgId];
    } else if ([m isEqualToString:@"setautostart"]) {
        [self replyToId:msgId result:@"unsupported" error:nil];
    } else if ([m isEqualToString:@"getautostart"]) {
        [self replyToId:msgId result:@"false" error:nil];
    } else if ([m isEqualToString:@"canbiometric"] || [m isEqualToString:@"biometricverify"]) {
        [self replyToId:msgId result:@NO error:nil];
    } else if ([m isEqualToString:@"exitapp"]) {
        [self replyToId:msgId result:@"ok" error:nil];
        dispatch_async(dispatch_get_main_queue(), ^{ [NSApp terminate:nil]; });
    } else {
        [self replyToId:msgId result:nil error:nil];
    }
}

/* ── Native Fetch CORS Proxy ─────────────────────────────────────────── */

- (void)handleNativeFetch:(NSArray *)args msgId:(NSString *)msgId {
    NSString *urlStr = [self strArg:args at:0];
    NSString *method = [self strArg:args at:1];
    if (method.length == 0) { method = @"GET"; }
    NSDictionary *reqHeaders = (args.count > 2 && [args[2] isKindOfClass:[NSDictionary class]]) ? args[2] : @{};
    NSString *bodyStr = [self strArg:args at:3];

    NSURL *url = [NSURL URLWithString:urlStr];
    if (!url) {
        [self sendNativeFetchReply:msgId status:0 text:@"" headers:@{} error:@"Invalid URL"];
        return;
    }

    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url
                                                       cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                   timeoutInterval:30.0];
    req.HTTPMethod = method;
    [reqHeaders enumerateKeysAndObjectsUsingBlock:^(id key, id val, BOOL *stop) {
        if ([key isKindOfClass:[NSString class]] && val != [NSNull null]) {
            [req setValue:[val description] forHTTPHeaderField:(NSString *)key];
        }
    }];
    [req setValue:@"https://abbeyroad.local" forHTTPHeaderField:@"Origin"];

    if (bodyStr.length > 0 && ![method isEqualToString:@"GET"] && ![method isEqualToString:@"HEAD"]) {
        req.HTTPBody = [bodyStr dataUsingEncoding:NSUTF8StringEncoding];
    }

    NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:req
        completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
            if (error) {
                [self sendNativeFetchReply:msgId status:0 text:@"" headers:@{} error:error.localizedDescription];
                return;
            }
            NSHTTPURLResponse *http = [response isKindOfClass:[NSHTTPURLResponse class]] ? (NSHTTPURLResponse *)response : nil;
            NSInteger status = http ? http.statusCode : 200;
            NSMutableDictionary *respHeaders = [NSMutableDictionary dictionary];
            if (http && http.allHeaderFields) {
                [http.allHeaderFields enumerateKeysAndObjectsUsingBlock:^(id k, id v, BOOL *stop) {
                    if ([k isKindOfClass:[NSString class]] && v) {
                        respHeaders[[(NSString *)k lowercaseString]] = [v description];
                    }
                }];
            }
            NSString *text = data ? ([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"") : @"";
            [self sendNativeFetchReply:msgId status:status text:text headers:respHeaders error:nil];
        }];
    [task resume];
}

- (void)sendNativeFetchReply:(NSString *)msgId
                      status:(NSInteger)status
                        text:(NSString *)text
                     headers:(NSDictionary *)headers
                       error:(NSString *)error {
    NSMutableDictionary *res = [NSMutableDictionary dictionary];
    if (error.length > 0) {
        res[@"error"] = error;
    } else {
        res[@"status"] = @(status);
        res[@"statusText"] = [NSHTTPURLResponse localizedStringForStatusCode:status] ?: @"OK";
        res[@"headers"] = headers ?: @{};
        res[@"body"] = text ?: @"";
    }
    NSError *jsonErr = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:res options:0 error:&jsonErr];
    if (!data || jsonErr) { return; }
    NSString *jsonStr = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    NSString *escapedId = [msgId stringByReplacingOccurrencesOfString:@"'" withString:@"\\'"];
    NSString *js = [NSString stringWithFormat:@"if(window.__macNativeFetchReply){window.__macNativeFetchReply('%@', %@);}", escapedId, jsonStr];
    dispatch_async(dispatch_get_main_queue(), ^{
        [self.webView evaluateJavaScript:js completionHandler:nil];
    });
}

/* ── File / Calendar / Image / Notification Helpers ──────────────────── */

- (NSString *)safeFileName:(NSString *)name fallback:(NSString *)fallback {
    if (name.length == 0) { return fallback; }
    NSString *s = [[name stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]]
                   stringByReplacingOccurrencesOfString:@"\\" withString:@"/"];
    NSString *last = [s lastPathComponent];
    last = [last stringByReplacingOccurrencesOfString:@".." withString:@""];
    NSMutableString *clean = [NSMutableString stringWithCapacity:last.length];
    NSCharacterSet *bad = [NSCharacterSet characterSetWithCharactersInString:@":*?\"<>|/\0"];
    for (NSUInteger i = 0; i < last.length; i++) {
        unichar c = [last characterAtIndex:i];
        if (c < 0x20 || [bad characterIsMember:c]) { continue; }
        [clean appendFormat:@"%C", c];
    }
    NSString *trimmed = [clean stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@". "]];
    return trimmed.length > 0 ? trimmed : fallback;
}

- (NSString *)icsEscape:(NSString *)s {
    if (s.length == 0) { return @""; }
    NSString *out = [s stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"];
    out = [out stringByReplacingOccurrencesOfString:@";" withString:@"\\;"];
    out = [out stringByReplacingOccurrencesOfString:@"," withString:@"\\,"];
    out = [out stringByReplacingOccurrencesOfString:@"\r\n" withString:@"\\n"];
    out = [out stringByReplacingOccurrencesOfString:@"\n" withString:@"\\n"];
    return out;
}

- (void)handleAddCalendarEvent:(NSArray *)args msgId:(NSString *)msgId {
    NSString *title = [self strArg:args at:0];
    NSString *location = [self strArg:args at:1];
    NSString *desc = [self strArg:args at:2];
    long long beginMs = [self longArg:args at:3];
    long long endMs = [self longArg:args at:4];
    if (beginMs <= 0) {
        [self replyToId:msgId result:@"时间无效" error:nil];
        return;
    }
    if (endMs <= beginMs) { endMs = beginMs + 45LL * 60LL * 1000LL; }

    NSDate *startDate = [NSDate dateWithTimeIntervalSince1970:(double)beginMs / 1000.0];
    NSDate *endDate = [NSDate dateWithTimeIntervalSince1970:(double)endMs / 1000.0];

    NSDateFormatter *localFmt = [[NSDateFormatter alloc] init];
    localFmt.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    localFmt.dateFormat = @"yyyyMMdd'T'HHmmss";

    NSDateFormatter *utcFmt = [[NSDateFormatter alloc] init];
    utcFmt.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    utcFmt.timeZone = [NSTimeZone timeZoneWithAbbreviation:@"UTC"];
    utcFmt.dateFormat = @"yyyyMMdd'T'HHmmss'Z'";

    long long ts = (long long)[[NSDate date] timeIntervalSince1970];
    NSMutableString *ics = [NSMutableString string];
    [ics appendString:@"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Allegro//Schedule//CN\r\nCALSCALE:GREGORIAN\r\nBEGIN:VEVENT\r\n"];
    [ics appendFormat:@"UID:%lld@allegro\r\n", ts];
    [ics appendFormat:@"DTSTAMP:%@\r\n", [utcFmt stringFromDate:[NSDate date]]];
    [ics appendFormat:@"DTSTART:%@\r\n", [localFmt stringFromDate:startDate]];
    [ics appendFormat:@"DTEND:%@\r\n", [localFmt stringFromDate:endDate]];
    [ics appendFormat:@"SUMMARY:%@\r\n", [self icsEscape:title]];
    [ics appendFormat:@"LOCATION:%@\r\n", [self icsEscape:location]];
    [ics appendFormat:@"DESCRIPTION:%@\r\n", [self icsEscape:desc]];
    [ics appendFormat:@"BEGIN:VALARM\r\nTRIGGER:-PT15M\r\nACTION:DISPLAY\r\nDESCRIPTION:%@\r\nEND:VALARM\r\n", [self icsEscape:title]];
    [ics appendString:@"END:VEVENT\r\nEND:VCALENDAR\r\n"];

    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"Allegro-%lld.ics", ts]];
    [ics writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil];
    [[NSWorkspace sharedWorkspace] openURL:[NSURL fileURLWithPath:path]];
    [self replyToId:msgId result:@"ics" error:nil];
}

- (void)handleExportText:(NSArray *)args msgId:(NSString *)msgId {
    NSString *fileName = [self safeFileName:[self strArg:args at:0] fallback:@"Allegro-backup.json"];
    NSString *content = [self strArg:args at:1];

    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.title = @"导出 Allegro 数据";
    panel.nameFieldStringValue = fileName;
    panel.canCreateDirectories = YES;

    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        if (result != NSModalResponseOK || !panel.URL) {
            [self replyToId:msgId result:@"cancelled" error:nil];
            return;
        }
        NSError *err = nil;
        [content writeToURL:panel.URL atomically:YES encoding:NSUTF8StringEncoding error:&err];
        if (err) {
            [self replyToId:msgId result:[@"导出失败：" stringByAppendingString:err.localizedDescription] error:nil];
            return;
        }
        [self postEvent:@{@"event": @"exported", @"name": panel.URL.lastPathComponent ?: fileName}];
        [self replyToId:msgId result:panel.URL.path error:nil];
    }];
}

- (void)handleImportText:(NSString *)msgId {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.title = @"导入 Allegro 数据";
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = NO;

    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        if (result != NSModalResponseOK || !panel.URL) {
            [self replyToId:msgId result:@"cancelled" error:nil];
            return;
        }
        NSError *err = nil;
        NSDictionary *attrs = [[NSFileManager defaultManager] attributesOfItemAtPath:panel.URL.path error:&err];
        unsigned long long size = [attrs fileSize];
        if (size > kMaxImportBytes) {
            [self replyToId:msgId result:@"文件太大，最多支持 8 MB；请先精简后再导入。" error:nil];
            return;
        }
        NSString *text = [NSString stringWithContentsOfURL:panel.URL encoding:NSUTF8StringEncoding error:&err];
        if (!text) {
            [self replyToId:msgId result:[@"读取失败：" stringByAppendingString:(err.localizedDescription ?: @"")] error:nil];
            return;
        }
        [self postEvent:@{@"event": @"fileText", @"text": text, @"name": panel.URL.lastPathComponent ?: @"import.json"}];
        [self replyToId:msgId result:panel.URL.path error:nil];
    }];
}

- (NSString *)downloadsDir {
    NSArray<NSString *> *dirs = NSSearchPathForDirectoriesInDomains(NSDownloadsDirectory, NSUserDomainMask, YES);
    return dirs.firstObject ?: [NSHomeDirectory() stringByAppendingPathComponent:@"Downloads"];
}

- (void)handleShareFile:(NSArray *)args msgId:(NSString *)msgId {
    NSString *name = [self safeFileName:[self strArg:args at:0] fallback:@"Allegro-backup.json"];
    NSString *content = [self strArg:args at:1];
    NSString *dir = [self downloadsDir];
    [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
    NSString *dest = [dir stringByAppendingPathComponent:name];
    NSError *err = nil;
    [content writeToFile:dest atomically:YES encoding:NSUTF8StringEncoding error:&err];

    NSPasteboard *pb = [NSPasteboard generalPasteboard];
    [pb clearContents];
    [pb setString:content forType:NSPasteboardTypeString];

    if (err) {
        [self replyToId:msgId result:@"已复制内容，粘贴到微信发送即可" error:nil];
    } else {
        [self replyToId:msgId result:[@"已存到「下载」目录并复制了内容，可拖进微信发送：" stringByAppendingString:name] error:nil];
    }
}

- (NSData *)decodeDataUrl:(NSString *)dataUrl {
    if (dataUrl.length == 0) { return nil; }
    NSRange comma = [dataUrl rangeOfString:@","];
    NSString *b64 = (comma.location != NSNotFound) ? [dataUrl substringFromIndex:comma.location + 1] : dataUrl;
    return [[NSData alloc] initWithBase64EncodedString:b64 options:NSDataBase64DecodingIgnoreUnknownCharacters];
}

- (void)handleSaveImage:(NSArray *)args msgId:(NSString *)msgId {
    NSString *fileName = [self safeFileName:[self strArg:args at:0] fallback:@"whisper-card.png"];
    NSData *bytes = [self decodeDataUrl:[self strArg:args at:1]];
    if (bytes.length == 0) {
        [self replyToId:msgId result:@"图片数据无效" error:nil];
        return;
    }

    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.title = @"保存日记图片";
    panel.nameFieldStringValue = fileName;
    panel.canCreateDirectories = YES;

    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        if (result != NSModalResponseOK || !panel.URL) {
            [self replyToId:msgId result:@"cancelled" error:nil];
            return;
        }
        NSError *err = nil;
        [bytes writeToURL:panel.URL options:NSDataWritingAtomic error:&err];
        if (err) {
            [self replyToId:msgId result:[@"保存失败：" stringByAppendingString:err.localizedDescription] error:nil];
            return;
        }
        [self replyToId:msgId result:[@"图片已保存：" stringByAppendingString:(panel.URL.lastPathComponent ?: fileName)] error:nil];
    }];
}

- (void)handleShareImage:(NSArray *)args msgId:(NSString *)msgId {
    NSString *name = [self safeFileName:[self strArg:args at:0] fallback:@"whisper-card.png"];
    NSData *bytes = [self decodeDataUrl:[self strArg:args at:1]];
    if (bytes.length == 0) {
        [self replyToId:msgId result:@"图片数据无效" error:nil];
        return;
    }

    NSString *dir = [self downloadsDir];
    [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
    NSString *dest = [dir stringByAppendingPathComponent:name];
    BOOL saved = [bytes writeToFile:dest atomically:YES];

    NSImage *img = [[NSImage alloc] initWithData:bytes];
    if (img) {
        NSPasteboard *pb = [NSPasteboard generalPasteboard];
        [pb clearContents];
        [pb writeObjects:@[img]];
    }
    NSString *res = saved ? [@"已存到「下载」并复制图片到剪贴板：" stringByAppendingString:name] : @"已复制图片到剪贴板";
    [self replyToId:msgId result:res error:nil];
}

- (void)handleListExports:(NSString *)msgId {
    NSString *dir = [self downloadsDir];
    NSFileManager *fm = [NSFileManager defaultManager];
    NSArray<NSString *> *items = [fm contentsOfDirectoryAtPath:dir error:nil] ?: @[];
    NSMutableArray<NSString *> *matched = [NSMutableArray array];
    for (NSString *name in items) {
        if ([[name pathExtension].lowercaseString isEqualToString:@"json"] &&
            ([name hasPrefix:@"Allegro"] || [name hasPrefix:@"AbbeyRoad"])) {
            [matched addObject:name];
        }
    }
    [matched sortUsingComparator:^NSComparisonResult(NSString *a, NSString *b) {
        return [b compare:a];
    }];

    NSMutableArray<NSDictionary *> *out = [NSMutableArray array];
    NSUInteger limit = MIN(matched.count, 30);
    for (NSUInteger i = 0; i < limit; i++) {
        NSString *name = matched[i];
        NSString *full = [dir stringByAppendingPathComponent:name];
        NSDictionary *attrs = [fm attributesOfItemAtPath:full error:nil];
        unsigned long long size = [attrs fileSize];
        NSDate *mod = [attrs fileModificationDate] ?: [NSDate date];
        long long modMs = (long long)([mod timeIntervalSince1970] * 1000.0);
        [out addObject:@{
            @"name": name,
            @"uri": full,
            @"size": @(size),
            @"modified": @(modMs)
        }];
    }
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:out options:0 error:nil];
    NSString *jsonStr = jsonData ? [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding] : @"[]";
    [self replyToId:msgId result:jsonStr error:nil];
}

- (void)handleReadTextUri:(NSArray *)args msgId:(NSString *)msgId {
    NSString *path = [self strArg:args at:0];
    if (path.length == 0 || ![[NSFileManager defaultManager] fileExistsAtPath:path]) {
        [self replyToId:msgId result:@"" error:nil];
        return;
    }
    NSDictionary *attrs = [[NSFileManager defaultManager] attributesOfItemAtPath:path error:nil];
    if ([attrs fileSize] > kMaxImportBytes) {
        [self replyToId:msgId result:@"" error:nil];
        return;
    }
    NSString *text = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil] ?: @"";
    [self replyToId:msgId result:text error:nil];
}

- (void)handleNotifyTitle:(NSString *)title body:(NSString *)body msgId:(NSString *)msgId {
    @try {
        UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
        [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound)
                              completionHandler:^(BOOL granted, NSError *error) {
            if (!granted || error) { return; }
            UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
            content.title = title.length ? title : @"Allegro";
            content.body = body ?: @"";
            content.sound = [UNNotificationSound defaultSound];
            UNNotificationRequest *req = [UNNotificationRequest requestWithIdentifier:[[NSUUID UUID] UUIDString]
                                                                              content:content
                                                                              trigger:nil];
            [center addNotificationRequest:req withCompletionHandler:nil];
        }];
    } @catch (NSException *ex) {
    }
    [self replyToId:msgId result:@"ok" error:nil];
}

@end
