# Eval snapshot: url-grounding — 2026-05-19

```json
{
  "evalId": "eval-jbk-2026-05-19T22:20:39",
  "results": {
    "version": 3,
    "timestamp": "2026-05-19T22:20:39.572Z",
    "prompts": [
      {
        "id": "d3bcaf71c11c2678899be04d872718325f0916b3b0705e805ee29930663a42e2",
        "raw": "{{question}}",
        "label": "{{question}}",
        "provider": "file://../../src/providers/agent-provider.ts",
        "metrics": {
          "score": 3.1833333333333336,
          "testPassCount": 0,
          "testFailCount": 5,
          "testErrorCount": 0,
          "assertPassCount": 7,
          "assertFailCount": 6,
          "totalLatencyMs": 25403,
          "tokenUsage": {
            "prompt": 0,
            "completion": 0,
            "cached": 0,
            "total": 0,
            "numRequests": 5,
            "completionDetails": {
              "reasoning": 0,
              "acceptedPrediction": 0,
              "rejectedPrediction": 0,
              "cacheReadInputTokens": 0,
              "cacheCreationInputTokens": 0
            },
            "assertions": {
              "total": 2298,
              "prompt": 1449,
              "completion": 849,
              "cached": 0,
              "numRequests": 0,
              "completionDetails": {
                "reasoning": 0,
                "acceptedPrediction": 0,
                "rejectedPrediction": 0,
                "cacheReadInputTokens": 0,
                "cacheCreationInputTokens": 0
              }
            }
          },
          "namedScores": {},
          "namedScoresCount": {},
          "namedScoreWeights": {},
          "cost": 0
        }
      }
    ],
    "results": [
      {
        "cost": 0,
        "error": "The output addresses what HTCPCP stands for and its purpose, and cites two line references (L6 and L20). However, without access to the source document, I cannot verify whether these citations actually exist or whether they plausibly support the claims made. The output appears well-structured and the claims seem reasonable for a technical protocol, but the rubric requires that cited lines 'plausibly support the claim' and that facts come from the document. Without seeing the document, I cannot confirm these requirements are met.",
        "gradingResult": {
          "pass": false,
          "score": 0.8333333333333334,
          "reason": "The output addresses what HTCPCP stands for and its purpose, and cites two line references (L6 and L20). However, without access to the source document, I cannot verify whether these citations actually exist or whether they plausibly support the claims made. The output appears well-structured and the claims seem reasonable for a technical protocol, but the rubric requires that cited lines 'plausibly support the claim' and that facts come from the document. Without seeing the document, I cannot confirm these requirements are met.",
          "namedScores": {},
          "tokensUsed": {
            "total": 432,
            "prompt": 288,
            "completion": 144,
            "cached": 0,
            "numRequests": 0
          },
          "componentResults": [
            {
              "pass": true,
              "score": 1,
              "reason": "Assertion passed",
              "assertion": {
                "type": "regex",
                "value": "L\\d+"
              }
            },
            {
              "assertion": {
                "type": "llm-rubric",
                "value": "The answer addresses the question and cites at least one Lxx line\nreference. The cited line should plausibly support the claim. The\nanswer should not contain facts that aren't in the document.\n"
              },
              "pass": false,
              "score": 0.5,
              "reason": "The output addresses what HTCPCP stands for and its purpose, and cites two line references (L6 and L20). However, without access to the source document, I cannot verify whether these citations actually exist or whether they plausibly support the claims made. The output appears well-structured and the claims seem reasonable for a technical protocol, but the rubric requires that cited lines 'plausibly support the claim' and that facts come from the document. Without seeing the document, I cannot confirm these requirements are met.",
              "tokensUsed": {
                "total": 432,
                "prompt": 288,
                "completion": 144,
                "cached": 0,
                "numRequests": 0,
                "completionDetails": {
                  "cacheReadInputTokens": 0,
                  "cacheCreationInputTokens": 0
                }
              },
              "metadata": {
                "renderedGradingPrompt": "[{\"role\":\"system\",\"content\":\"You are grading output according to a user-specified rubric. If the statement in the rubric is true, then the output passes the test. You respond with a JSON object with this structure: {reason: string, pass: boolean, score: number}\\n\\nExamples:\\n\\n<Output>Hello world</Output>\\n<Rubric>Content contains a greeting</Rubric>\\n{\\\"reason\\\": \\\"the content contains the word 'Hello'\\\", \\\"pass\\\": true, \\\"score\\\": 1.0}\\n\\n<Output>Avast ye swabs, repel the invaders!</Output>\\n<Rubric>Does not speak like a pirate</Rubric>\\n{\\\"reason\\\": \\\"'avast ye' is a common pirate term\\\", \\\"pass\\\": false, \\\"score\\\": 0.0}\"},{\"role\":\"user\",\"content\":\"<Output>\\nHTCPCP stands for Hyper Text Coffee Pot Control Protocol (see L6). It is a protocol for controlling, monitoring, and diagnosing coffee pots (see L20).\\n</Output>\\n<Rubric>\\nThe answer addresses the question and cites at least one Lxx line\\nreference. The cited line should plausibly support the claim. The\\nanswer should not contain facts that aren't in the document.\\n\\n</Rubric>\"}]"
              }
            },
            {
              "pass": true,
              "score": 1,
              "reason": "Assertion passed",
              "assertion": {
                "type": "contains",
                "value": "Hyper Text Coffee Pot Control Protocol"
              }
            }
          ]
        },
        "id": "59370eae-c089-4a0e-96a8-63dec4143ed9",
        "latencyMs": 3114,
        "namedScores": {},
        "prompt": {
          "raw": "What does HTCPCP stand for?",
          "label": "{{question}}",
          "config": {
            "provider": "anthropic:messages:claude-haiku-4-5"
          }
        },
        "promptId": "d3bcaf71c11c2678899be04d872718325f0916b3b0705e805ee29930663a42e2",
        "promptIdx": 0,
        "provider": {
          "id": "file://../../src/providers/agent-provider.ts",
          "label": ""
        },
        "response": {
          "output": "HTCPCP stands for Hyper Text Coffee Pot Control Protocol (see L6). It is a protocol for controlling, monitoring, and diagnosing coffee pots (see L20)."
        },
        "score": 0.8333333333333334,
        "success": false,
        "testCase": {
          "description": "HTCPCP expansion grounded in RFC 2324",
          "vars": {
            "kb_url": "https://www.rfc-editor.org/rfc/rfc2324.html",
            "question": "What does HTCPCP stand for?"
          },
          "assert": [
            {
              "type": "regex",
              "value": "L\\d+"
            },
            {
              "type": "llm-rubric",
              "value": "The answer addresses the question and cites at least one Lxx line\nreference. The cited line should plausibly support the claim. The\nanswer should not contain facts that aren't in the document.\n"
            },
            {
              "type": "contains",
              "value": "Hyper Text Coffee Pot Control Protocol"
            }
          ],
          "options": {
            "provider": "anthropic:messages:claude-haiku-4-5"
          },
          "metadata": {}
        },
        "testIdx": 0,
        "vars": {
          "kb_url": "https://www.rfc-editor.org/rfc/rfc2324.html",
          "question": "What does HTCPCP stand for?"
        },
        "metadata": {
          "_promptfooFileMetadata": {}
        },
        "failureReason": 1
      },
      {
        "cost": 0,
        "error": "The output cites line references (L228–L231) as required by the rubric. However, RFC 2324 is actually an April Fools' RFC from 1998 about the Hyper Text Coffee Pot Control Protocol (HTCPCP), not a standard HTTP specification document. The claim about HTTP status code 418 and the teapot message is accurate to RFC 2324, but without access to the actual document being evaluated, I cannot verify whether lines 228-231 actually contain this information or whether the cited lines plausibly support the claim. The statement itself is factually accurate regarding RFC 2324's actual content, but the rubric requires that claims be supported by the specific document being graded, which is not provided in this context.",
        "gradingResult": {
          "pass": false,
          "score": 0.8333333333333334,
          "reason": "The output cites line references (L228–L231) as required by the rubric. However, RFC 2324 is actually an April Fools' RFC from 1998 about the Hyper Text Coffee Pot Control Protocol (HTCPCP), not a standard HTTP specification document. The claim about HTTP status code 418 and the teapot message is accurate to RFC 2324, but without access to the actual document being evaluated, I cannot verify whether lines 228-231 actually contain this information or whether the cited lines plausibly support the claim. The statement itself is factually accurate regarding RFC 2324's actual content, but the rubric requires that claims be supported by the specific document being graded, which is not provided in this context.",
          "namedScores": {},
          "tokensUsed": {
            "total": 547,
            "prompt": 297,
            "completion": 250,
            "cached": 0,
            "numRequests": 0
          },
          "componentResults": [
            {
              "pass": true,
              "score": 1,
              "reason": "Assertion passed",
              "assertion": {
                "type": "regex",
                "value": "L\\d+"
              }
            },
            {
              "assertion": {
                "type": "llm-rubric",
                "value": "The answer addresses the question and cites at least one Lxx line\nreference. The cited line should plausibly support the claim. The\nanswer should not contain facts that aren't in the document.\n"
              },
              "pass": false,
              "score": 0.5,
              "reason": "The output cites line references (L228–L231) as required by the rubric. However, RFC 2324 is actually an April Fools' RFC from 1998 about the Hyper Text Coffee Pot Control Protocol (HTCPCP), not a standard HTTP specification document. The claim about HTTP status code 418 and the teapot message is accurate to RFC 2324, but without access to the actual document being evaluated, I cannot verify whether lines 228-231 actually contain this information or whether the cited lines plausibly support the claim. The statement itself is factually accurate regarding RFC 2324's actual content, but the rubric requires that claims be supported by the specific document being graded, which is not provided in this context.",
              "tokensUsed": {
                "total": 547,
                "prompt": 297,
                "completion": 250,
                "cached": 0,
                "numRequests": 0,
                "completionDetails": {
                  "cacheReadInputTokens": 0,
                  "cacheCreationInputTokens": 0
                }
              },
              "metadata": {
                "renderedGradingPrompt": "[{\"role\":\"system\",\"content\":\"You are grading output according to a user-specified rubric. If the statement in the rubric is true, then the output passes the test. You respond with a JSON object with this structure: {reason: string, pass: boolean, score: number}\\n\\nExamples:\\n\\n<Output>Hello world</Output>\\n<Rubric>Content contains a greeting</Rubric>\\n{\\\"reason\\\": \\\"the content contains the word 'Hello'\\\", \\\"pass\\\": true, \\\"score\\\": 1.0}\\n\\n<Output>Avast ye swabs, repel the invaders!</Output>\\n<Rubric>Does not speak like a pirate</Rubric>\\n{\\\"reason\\\": \\\"'avast ye' is a common pirate term\\\", \\\"pass\\\": false, \\\"score\\\": 0.0}\"},{\"role\":\"user\",\"content\":\"<Output>\\nRFC 2324 reserves HTTP status code 418, with the message \\\"I'm a teapot.\\\" It specifies that any attempt to brew coffee with a teapot should result in this error code (see L228–L231).\\n</Output>\\n<Rubric>\\nThe answer addresses the question and cites at least one Lxx line\\nreference. The cited line should plausibly support the claim. The\\nanswer should not contain facts that aren't in the document.\\n\\n</Rubric>\"}]"
              }
            },
            {
              "pass": true,
              "score": 1,
              "reason": "Assertion passed",
              "assertion": {
                "type": "contains",
                "value": "418"
              }
            }
          ]
        },
        "id": "449267e7-2eaf-4c27-b16a-9f5394488571",
        "latencyMs": 3531,
        "namedScores": {},
        "prompt": {
          "raw": "What HTTP status code does RFC 2324 reserve for teapots?",
          "label": "{{question}}",
          "config": {
            "provider": "anthropic:messages:claude-haiku-4-5"
          }
        },
        "promptId": "d3bcaf71c11c2678899be04d872718325f0916b3b0705e805ee29930663a42e2",
        "promptIdx": 0,
        "provider": {
          "id": "file://../../src/providers/agent-provider.ts",
          "label": ""
        },
        "response": {
          "output": "RFC 2324 reserves HTTP status code 418, with the message \"I'm a teapot.\" It specifies that any attempt to brew coffee with a teapot should result in this error code (see L228–L231)."
        },
        "score": 0.8333333333333334,
        "success": false,
        "testCase": {
          "description": "418 status code lookup",
          "vars": {
            "kb_url": "https://www.rfc-editor.org/rfc/rfc2324.html",
            "question": "What HTTP status code does RFC 2324 reserve for teapots?"
          },
          "assert": [
            {
              "type": "regex",
              "value": "L\\d+"
            },
            {
              "type": "llm-rubric",
              "value": "The answer addresses the question and cites at least one Lxx line\nreference. The cited line should plausibly support the claim. The\nanswer should not contain facts that aren't in the document.\n"
            },
            {
              "type": "contains",
              "value": "418"
            }
          ],
          "options": {
            "provider": "anthropic:messages:claude-haiku-4-5"
          },
          "metadata": {}
        },
        "testIdx": 1,
        "vars": {
          "kb_url": "https://www.rfc-editor.org/rfc/rfc2324.html",
          "question": "What HTTP status code does RFC 2324 reserve for teapots?"
        },
        "metadata": {
          "_promptfooFileMetadata": {}
        },
        "failureReason": 1
      },
      {
        "cost": 0,
        "error": "The output is empty and contains no answer, citations, or line references. It fails to address any question, cite any Lxx line reference, or provide any content that could be evaluated against the rubric's requirements.",
        "gradingResult": {
          "pass": false,
          "score": 0,
          "reason": "The output is empty and contains no answer, citations, or line references. It fails to address any question, cite any Lxx line reference, or provide any content that could be evaluated against the rubric's requirements.",
          "namedScores": {},
          "tokensUsed": {
            "total": 323,
            "prompt": 245,
            "completion": 78,
            "cached": 0,
            "numRequests": 0
          },
          "componentResults": [
            {
              "pass": false,
              "score": 0,
              "reason": "Expected output to match regex \"L\\d+\"",
              "assertion": {
                "type": "regex",
                "value": "L\\d+"
              }
            },
            {
              "assertion": {
                "type": "llm-rubric",
                "value": "The answer addresses the question and cites at least one Lxx line\nreference. The cited line should plausibly support the claim. The\nanswer should not contain facts that aren't in the document.\n"
              },
              "pass": false,
              "score": 0,
              "reason": "The output is empty and contains no answer, citations, or line references. It fails to address any question, cite any Lxx line reference, or provide any content that could be evaluated against the rubric's requirements.",
              "tokensUsed": {
                "total": 323,
                "prompt": 245,
                "completion": 78,
                "cached": 0,
                "numRequests": 0,
                "completionDetails": {
                  "cacheReadInputTokens": 0,
                  "cacheCreationInputTokens": 0
                }
              },
              "metadata": {
                "renderedGradingPrompt": "[{\"role\":\"system\",\"content\":\"You are grading output according to a user-specified rubric. If the statement in the rubric is true, then the output passes the test. You respond with a JSON object with this structure: {reason: string, pass: boolean, score: number}\\n\\nExamples:\\n\\n<Output>Hello world</Output>\\n<Rubric>Content contains a greeting</Rubric>\\n{\\\"reason\\\": \\\"the content contains the word 'Hello'\\\", \\\"pass\\\": true, \\\"score\\\": 1.0}\\n\\n<Output>Avast ye swabs, repel the invaders!</Output>\\n<Rubric>Does not speak like a pirate</Rubric>\\n{\\\"reason\\\": \\\"'avast ye' is a common pirate term\\\", \\\"pass\\\": false, \\\"score\\\": 0.0}\"},{\"role\":\"user\",\"content\":\"<Output>\\n\\n</Output>\\n<Rubric>\\nThe answer addresses the question and cites at least one Lxx line\\nreference. The cited line should plausibly support the claim. The\\nanswer should not contain facts that aren't in the document.\\n\\n</Rubric>\"}]"
              }
            }
          ]
        },
        "id": "6adb6827-85f4-40d0-a6af-5133a547500e",
        "latencyMs": 9850,
        "namedScores": {},
        "prompt": {
          "raw": "Which tea varieties does the HTCPCP-TEA extension define?",
          "label": "{{question}}",
          "config": {
            "provider": "anthropic:messages:claude-haiku-4-5"
          }
        },
        "promptId": "d3bcaf71c11c2678899be04d872718325f0916b3b0705e805ee29930663a42e2",
        "promptIdx": 0,
        "provider": {
          "id": "file://../../src/providers/agent-provider.ts",
          "label": ""
        },
        "response": {
          "output": ""
        },
        "score": 0,
        "success": false,
        "testCase": {
          "description": "HTCPCP-TEA varieties",
          "vars": {
            "kb_url": "https://www.rfc-editor.org/rfc/rfc7168.html",
            "question": "Which tea varieties does the HTCPCP-TEA extension define?"
          },
          "assert": [
            {
              "type": "regex",
              "value": "L\\d+"
            },
            {
              "type": "llm-rubric",
              "value": "The answer addresses the question and cites at least one Lxx line\nreference. The cited line should plausibly support the claim. The\nanswer should not contain facts that aren't in the document.\n"
            }
          ],
          "options": {
            "provider": "anthropic:messages:claude-haiku-4-5"
          },
          "metadata": {}
        },
        "testIdx": 2,
        "vars": {
          "kb_url": "https://www.rfc-editor.org/rfc/rfc7168.html",
          "question": "Which tea varieties does the HTCPCP-TEA extension define?"
        },
        "metadata": {
          "_promptfooFileMetadata": {}
        },
        "failureReason": 1
      },
      {
        "cost": 0,
        "error": "The output addresses the question about HTCPCP's publication by providing the date (April 1, 1998) and RFC number (2324). It cites two line references (L3 and L5) in parentheses. However, without access to the source document, I cannot verify whether these line references actually exist in the document or whether they plausibly support the claims made. The citation format suggests an attempt to follow the rubric requirement, but the plausibility of the support cannot be confirmed without seeing the referenced document.",
        "gradingResult": {
          "pass": false,
          "score": 0.75,
          "reason": "The output addresses the question about HTCPCP's publication by providing the date (April 1, 1998) and RFC number (2324). It cites two line references (L3 and L5) in parentheses. However, without access to the source document, I cannot verify whether these line references actually exist in the document or whether they plausibly support the claims made. The citation format suggests an attempt to follow the rubric requirement, but the plausibility of the support cannot be confirmed without seeing the referenced document.",
          "namedScores": {},
          "tokensUsed": {
            "total": 443,
            "prompt": 296,
            "completion": 147,
            "cached": 0,
            "numRequests": 0
          },
          "componentResults": [
            {
              "pass": true,
              "score": 1,
              "reason": "Assertion passed",
              "assertion": {
                "type": "regex",
                "value": "L\\d+"
              }
            },
            {
              "assertion": {
                "type": "llm-rubric",
                "value": "The answer addresses the question and cites at least one Lxx line\nreference. The cited line should plausibly support the claim. The\nanswer should not contain facts that aren't in the document.\n"
              },
              "pass": false,
              "score": 0.5,
              "reason": "The output addresses the question about HTCPCP's publication by providing the date (April 1, 1998) and RFC number (2324). It cites two line references (L3 and L5) in parentheses. However, without access to the source document, I cannot verify whether these line references actually exist in the document or whether they plausibly support the claims made. The citation format suggests an attempt to follow the rubric requirement, but the plausibility of the support cannot be confirmed without seeing the referenced document.",
              "tokensUsed": {
                "total": 443,
                "prompt": 296,
                "completion": 147,
                "cached": 0,
                "numRequests": 0,
                "completionDetails": {
                  "cacheReadInputTokens": 0,
                  "cacheCreationInputTokens": 0
                }
              },
              "metadata": {
                "renderedGradingPrompt": "[{\"role\":\"system\",\"content\":\"You are grading output according to a user-specified rubric. If the statement in the rubric is true, then the output passes the test. You respond with a JSON object with this structure: {reason: string, pass: boolean, score: number}\\n\\nExamples:\\n\\n<Output>Hello world</Output>\\n<Rubric>Content contains a greeting</Rubric>\\n{\\\"reason\\\": \\\"the content contains the word 'Hello'\\\", \\\"pass\\\": true, \\\"score\\\": 1.0}\\n\\n<Output>Avast ye swabs, repel the invaders!</Output>\\n<Rubric>Does not speak like a pirate</Rubric>\\n{\\\"reason\\\": \\\"'avast ye' is a common pirate term\\\", \\\"pass\\\": false, \\\"score\\\": 0.0}\"},{\"role\":\"user\",\"content\":\"<Output>\\nHTCPCP was first published on April 1, 1998, as RFC 2324. It was released as an April Fools' Day RFC by the Internet Engineering Task Force (see L3 and L5).\\n</Output>\\n<Rubric>\\nThe answer addresses the question and cites at least one Lxx line\\nreference. The cited line should plausibly support the claim. The\\nanswer should not contain facts that aren't in the document.\\n\\n</Rubric>\"}]"
              }
            }
          ]
        },
        "id": "0a516664-846d-4d38-afc2-ad00f1f51c88",
        "latencyMs": 4443,
        "namedScores": {},
        "prompt": {
          "raw": "When was HTCPCP first published?",
          "label": "{{question}}",
          "config": {
            "provider": "anthropic:messages:claude-haiku-4-5"
          }
        },
        "promptId": "d3bcaf71c11c2678899be04d872718325f0916b3b0705e805ee29930663a42e2",
        "promptIdx": 0,
        "provider": {
          "id": "file://../../src/providers/agent-provider.ts",
          "label": ""
        },
        "response": {
          "output": "HTCPCP was first published on April 1, 1998, as RFC 2324. It was released as an April Fools' Day RFC by the Internet Engineering Task Force (see L3 and L5)."
        },
        "score": 0.75,
        "success": false,
        "testCase": {
          "description": "HTCPCP Wikipedia summary",
          "vars": {
            "kb_url": "https://en.wikipedia.org/wiki/Hyper_Text_Coffee_Pot_Control_Protocol",
            "question": "When was HTCPCP first published?"
          },
          "assert": [
            {
              "type": "regex",
              "value": "L\\d+"
            },
            {
              "type": "llm-rubric",
              "value": "The answer addresses the question and cites at least one Lxx line\nreference. The cited line should plausibly support the claim. The\nanswer should not contain facts that aren't in the document.\n"
            }
          ],
          "options": {
            "provider": "anthropic:messages:claude-haiku-4-5"
          },
          "metadata": {}
        },
        "testIdx": 3,
        "vars": {
          "kb_url": "https://en.wikipedia.org/wiki/Hyper_Text_Coffee_Pot_Control_Protocol",
          "question": "When was HTCPCP first published?"
        },
        "metadata": {
          "_promptfooFileMetadata": {}
        },
        "failureReason": 1
      },
      {
        "cost": 0,
        "error": "The output cites 'L3, L5' as references, which are Lxx line references as required by the rubric. However, without access to the actual document being referenced, I cannot verify whether these line citations plausibly support the claims made (that HTTP 418 was defined in RFC 2324, published April 1 1998 as an April Fools' joke, or that it was part of HTCPCP developed by Larry Masinter). The output does address the question about HTTP 418's origin. The critical issue is that I cannot confirm whether the facts stated are actually in the document or whether the cited lines genuinely support these claims.",
        "gradingResult": {
          "pass": false,
          "score": 0.7666666666666666,
          "reason": "The output cites 'L3, L5' as references, which are Lxx line references as required by the rubric. However, without access to the actual document being referenced, I cannot verify whether these line citations plausibly support the claims made (that HTTP 418 was defined in RFC 2324, published April 1 1998 as an April Fools' joke, or that it was part of HTCPCP developed by Larry Masinter). The output does address the question about HTTP 418's origin. The critical issue is that I cannot confirm whether the facts stated are actually in the document or whether the cited lines genuinely support these claims.",
          "namedScores": {},
          "tokensUsed": {
            "total": 553,
            "prompt": 323,
            "completion": 230,
            "cached": 0,
            "numRequests": 0
          },
          "componentResults": [
            {
              "pass": true,
              "score": 1,
              "reason": "Assertion passed",
              "assertion": {
                "type": "regex",
                "value": "L\\d+"
              }
            },
            {
              "assertion": {
                "type": "llm-rubric",
                "value": "The answer addresses the question and cites at least one Lxx line\nreference. The cited line should plausibly support the claim. The\nanswer should not contain facts that aren't in the document.\n"
              },
              "pass": false,
              "score": 0.3,
              "reason": "The output cites 'L3, L5' as references, which are Lxx line references as required by the rubric. However, without access to the actual document being referenced, I cannot verify whether these line citations plausibly support the claims made (that HTTP 418 was defined in RFC 2324, published April 1 1998 as an April Fools' joke, or that it was part of HTCPCP developed by Larry Masinter). The output does address the question about HTTP 418's origin. The critical issue is that I cannot confirm whether the facts stated are actually in the document or whether the cited lines genuinely support these claims.",
              "tokensUsed": {
                "total": 553,
                "prompt": 323,
                "completion": 230,
                "cached": 0,
                "numRequests": 0,
                "completionDetails": {
                  "cacheReadInputTokens": 0,
                  "cacheCreationInputTokens": 0
                }
              },
              "metadata": {
                "renderedGradingPrompt": "[{\"role\":\"system\",\"content\":\"You are grading output according to a user-specified rubric. If the statement in the rubric is true, then the output passes the test. You respond with a JSON object with this structure: {reason: string, pass: boolean, score: number}\\n\\nExamples:\\n\\n<Output>Hello world</Output>\\n<Rubric>Content contains a greeting</Rubric>\\n{\\\"reason\\\": \\\"the content contains the word 'Hello'\\\", \\\"pass\\\": true, \\\"score\\\": 1.0}\\n\\n<Output>Avast ye swabs, repel the invaders!</Output>\\n<Rubric>Does not speak like a pirate</Rubric>\\n{\\\"reason\\\": \\\"'avast ye' is a common pirate term\\\", \\\"pass\\\": false, \\\"score\\\": 0.0}\"},{\"role\":\"user\",\"content\":\"<Output>\\nHTTP status 418 (\\\"I'm a teapot\\\") was originally defined in RFC 2324, published on April 1, 1998 as an April Fools' Day joke. It was part of the Hyper Text Coffee Pot Control Protocol (HTCPCP), developed by Larry Masinter (see L3, L5).\\n</Output>\\n<Rubric>\\nThe answer addresses the question and cites at least one Lxx line\\nreference. The cited line should plausibly support the claim. The\\nanswer should not contain facts that aren't in the document.\\n\\n</Rubric>\"}]"
              }
            },
            {
              "pass": true,
              "score": 1,
              "reason": "Assertion passed",
              "assertion": {
                "type": "contains",
                "value": "2324"
              }
            }
          ]
        },
        "id": "1aa438d2-21b9-4b60-976f-c0685f1791b0",
        "latencyMs": 4465,
        "namedScores": {},
        "prompt": {
          "raw": "Which RFC originally defined HTTP status 418?",
          "label": "{{question}}",
          "config": {
            "provider": "anthropic:messages:claude-haiku-4-5"
          }
        },
        "promptId": "d3bcaf71c11c2678899be04d872718325f0916b3b0705e805ee29930663a42e2",
        "promptIdx": 0,
        "provider": {
          "id": "file://../../src/providers/agent-provider.ts",
          "label": ""
        },
        "response": {
          "output": "HTTP status 418 (\"I'm a teapot\") was originally defined in RFC 2324, published on April 1, 1998 as an April Fools' Day joke. It was part of the Hyper Text Coffee Pot Control Protocol (HTCPCP), developed by Larry Masinter (see L3, L5)."
        },
        "score": 0.7666666666666666,
        "success": false,
        "testCase": {
          "description": "HTTP 418 origin per Wikipedia",
          "vars": {
            "kb_url": "https://en.wikipedia.org/wiki/HTTP_418",
            "question": "Which RFC originally defined HTTP status 418?"
          },
          "assert": [
            {
              "type": "regex",
              "value": "L\\d+"
            },
            {
              "type": "llm-rubric",
              "value": "The answer addresses the question and cites at least one Lxx line\nreference. The cited line should plausibly support the claim. The\nanswer should not contain facts that aren't in the document.\n"
            },
            {
              "type": "contains",
              "value": "2324"
            }
          ],
          "options": {
            "provider": "anthropic:messages:claude-haiku-4-5"
          },
          "metadata": {}
        },
        "testIdx": 4,
        "vars": {
          "kb_url": "https://en.wikipedia.org/wiki/HTTP_418",
          "question": "Which RFC originally defined HTTP status 418?"
        },
        "metadata": {
          "_promptfooFileMetadata": {}
        },
        "failureReason": 1
      }
    ],
    "stats": {
      "successes": 0,
      "failures": 5,
      "errors": 0,
      "tokenUsage": {
        "prompt": 0,
        "completion": 0,
        "cached": 0,
        "total": 0,
        "numRequests": 5,
        "completionDetails": {
          "reasoning": 0,
          "acceptedPrediction": 0,
          "rejectedPrediction": 0,
          "cacheReadInputTokens": 0,
          "cacheCreationInputTokens": 0
        },
        "assertions": {
          "total": 2298,
          "prompt": 1449,
          "completion": 849,
          "cached": 0,
          "numRequests": 0,
          "completionDetails": {
            "reasoning": 0,
            "acceptedPrediction": 0,
            "rejectedPrediction": 0,
            "cacheReadInputTokens": 0,
            "cacheCreationInputTokens": 0
          }
        }
      },
      "durationMs": 12841,
      "evaluationDurationMs": 12841
    }
  },
  "config": {
    "tags": {},
    "description": "URL-grounded chat — broader grounding matrix",
    "prompts": [
      "{{question}}"
    ],
    "providers": [
      {
        "id": "file://../../src/providers/agent-provider.ts"
      }
    ],
    "tests": [
      {
        "description": "HTCPCP expansion grounded in RFC 2324",
        "vars": {
          "kb_url": "https://www.rfc-editor.org/rfc/rfc2324.html",
          "question": "What does HTCPCP stand for?"
        },
        "assert": [
          {
            "type": "contains",
            "value": "Hyper Text Coffee Pot Control Protocol"
          }
        ]
      },
      {
        "description": "418 status code lookup",
        "vars": {
          "kb_url": "https://www.rfc-editor.org/rfc/rfc2324.html",
          "question": "What HTTP status code does RFC 2324 reserve for teapots?"
        },
        "assert": [
          {
            "type": "contains",
            "value": "418"
          }
        ]
      },
      {
        "description": "HTCPCP-TEA varieties",
        "vars": {
          "kb_url": "https://www.rfc-editor.org/rfc/rfc7168.html",
          "question": "Which tea varieties does the HTCPCP-TEA extension define?"
        }
      },
      {
        "description": "HTCPCP Wikipedia summary",
        "vars": {
          "kb_url": "https://en.wikipedia.org/wiki/Hyper_Text_Coffee_Pot_Control_Protocol",
          "question": "When was HTCPCP first published?"
        }
      },
      {
        "description": "HTTP 418 origin per Wikipedia",
        "vars": {
          "kb_url": "https://en.wikipedia.org/wiki/HTTP_418",
          "question": "Which RFC originally defined HTTP status 418?"
        },
        "assert": [
          {
            "type": "contains",
            "value": "2324"
          }
        ]
      }
    ],
    "scenarios": [],
    "env": {},
    "defaultTest": {
      "assert": [
        {
          "type": "regex",
          "value": "L\\d+"
        },
        {
          "type": "llm-rubric",
          "value": "The answer addresses the question and cites at least one Lxx line\nreference. The cited line should plausibly support the claim. The\nanswer should not contain facts that aren't in the document.\n"
        }
      ],
      "options": {
        "provider": "anthropic:messages:claude-haiku-4-5"
      },
      "vars": {},
      "metadata": {}
    },
    "outputPath": [
      "/var/folders/c9/3zfz4pm13091c9n2q0s6kbkm0000gn/T/promptfoo-url-grounding-1779229238314.json"
    ],
    "extensions": [],
    "metadata": {},
    "evaluateOptions": {}
  },
  "shareableUrl": null,
  "metadata": {
    "promptfooVersion": "0.121.11",
    "nodeVersion": "v25.9.0",
    "platform": "darwin",
    "arch": "arm64",
    "exportedAt": "2026-05-19T22:20:52.438Z",
    "evaluationCreatedAt": "2026-05-19T22:20:39.572Z"
  }
}
```