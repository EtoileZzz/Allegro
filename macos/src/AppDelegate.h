#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface AppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate>

@property (nonatomic, strong) NSWindow *window;
@property (nonatomic, strong) WKWebView *webView;

@end
