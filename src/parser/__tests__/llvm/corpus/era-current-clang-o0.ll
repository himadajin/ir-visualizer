; ModuleID = 'main.c'
source_filename = "main.c"
target datalayout = "e-m:e-p270:32:32-p271:32:32-p272:64:64-i64:64-i128:128-f80:128-n8:16:32:64-S128"
target triple = "x86_64-pc-linux-gnu"

; Function Attrs: noinline nounwind optnone uwtable
define dso_local i32 @main() #0 {
  %1 = alloca i32, align 4
  %2 = alloca i32, align 4
  store i32 0, ptr %1, align 4
  store i32 41, ptr %2, align 4
  %3 = load i32, ptr %2, align 4
  %4 = icmp sgt i32 %3, 40
  br i1 %4, label %5, label %8

5:                                                ; preds = %0
  %6 = load i32, ptr %2, align 4
  %7 = add nsw i32 %6, 1
  store i32 %7, ptr %2, align 4
  br label %9

8:                                                ; preds = %0
  store i32 2, ptr %2, align 4
  br label %9

9:                                                ; preds = %8, %5
  %10 = load i32, ptr %2, align 4
  ret i32 %10
}

attributes #0 = { noinline nounwind optnone uwtable "min-legal-vector-width"="0" "no-trapping-math"="true" }

!llvm.module.flags = !{!0}
!llvm.ident = !{!1}

!0 = !{i32 1, !"wchar_size", i32 4}
!1 = !{!"clang version 18.1.8"}
